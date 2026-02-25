package ws

import (
	"encoding/json"
	"megaserver/internal/rooms"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
)

var AllRooms rooms.RoomMap

func (app *application) createRoomRequestHandler(w http.ResponseWriter, r *http.Request) {
	// TODO move this into middleware
	w.Header().Set("Access-Control-Allow-Origin", "*")

	roomID := AllRooms.CreateRoom()

	type resp struct {
		RoomID string `json:"room_id"`
	}

	app.logger.Info("all rooms: ", AllRooms.Map)
	json.NewEncoder(w).Encode(resp{RoomID: roomID})
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

type broadcastMsg struct {
	Message map[string]any
	RoomID  string
	Client  *websocket.Conn
}

var broadcast = make(chan broadcastMsg)
var done = make(chan struct{})

func shutdown() {
	close(done)
}

// connMu holds a per-connection write mutex to prevent concurrent writes.
var (
	connMu   = make(map[*websocket.Conn]*sync.Mutex)
	connMuMu sync.Mutex
)

func getConnMu(conn *websocket.Conn) *sync.Mutex {
	connMuMu.Lock()
	defer connMuMu.Unlock()
	if _, ok := connMu[conn]; !ok {
		connMu[conn] = &sync.Mutex{}
	}
	return connMu[conn]
}

func removeConnMu(conn *websocket.Conn) {
	connMuMu.Lock()
	defer connMuMu.Unlock()
	delete(connMu, conn)
}

func (app *application) broadcaster() {
	for {
		select {
		case <-done:
			connMuMu.Lock()
			for conn := range connMu {
				conn.Close()
				delete(connMu, conn)
			}
			connMuMu.Unlock()
			app.logger.Info("broadcaster shutting down")
			return

		case msg := <-broadcast:
			for _, client := range AllRooms.Map[msg.RoomID] {
				if client.Conn != msg.Client {
					err := client.Conn.WriteJSON(msg.Message)
					if err != nil {
						mu := getConnMu(client.Conn)
						mu.Lock()
						err := client.Conn.WriteJSON(msg.Message)
						mu.Unlock()
						if err != nil {
							app.logger.Error(err.Error())
							client.Conn.Close()
							removeConnMu(client.Conn)
						}
					}
				}
			}
		}
	}
}

func (app *application) joinRoomRequestHandler(w http.ResponseWriter, r *http.Request) {
	// TODO break this out into a util or middleware
	roomID, ok := r.URL.Query()["roomID"]
	if !ok {
		// TODO make this a structured error
		app.logger.Error("RoomID missing in URL Parameters")
		return
	}

	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		// TODO make this a structured error
		app.logger.Error("Web Socket Upgrade Error", err)
		return
	}

	AllRooms.InsertIntoRoom(roomID[0], false, ws)

	defer leave(roomID[0], ws)

	for {
		var msg broadcastMsg

		err := ws.ReadJSON(&msg.Message)
		if err != nil {
			// TODO make this a structured error
			if err != nil {
				if websocket.IsCloseError(err, websocket.CloseNormalClosure, websocket.CloseGoingAway, websocket.CloseNoStatusReceived) {
					app.logger.Info("client disconnected", "roomID", roomID[0])
				} else {
					app.logger.Error("Read Error: ", err)
				}
				break
			}
		}

		msg.Client = ws
		msg.RoomID = roomID[0]

		app.logger.Info("message:", msg.Message)

		broadcast <- msg
	}
}

func leave(roomID string, ws *websocket.Conn) {
	AllRooms.RemoveFromRoom(roomID, ws)
	removeConnMu(ws)
	ws.Close()

	broadcast <- broadcastMsg{
		Message: map[string]any{"leave": true},
		RoomID:  roomID,
		Client:  ws,
	}
}
