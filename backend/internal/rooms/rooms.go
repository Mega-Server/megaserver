package rooms

import (
	"log"
	"math/rand"
	"sync"

	"github.com/gorilla/websocket"
)

type Participant struct {
	ID   string
	Host bool
	Conn *websocket.Conn
}

type RoomMap struct {
	Mutex sync.RWMutex
	Map   map[string][]Participant
}

func (r *RoomMap) Init() {
	r.Map = make(map[string][]Participant)
}

func (r *RoomMap) Get(roomId string) []Participant {
	r.Mutex.RLock()
	defer r.Mutex.RUnlock()
	return r.Map[roomId]
}

func (r *RoomMap) CreateRoom() string {
	r.Mutex.Lock()
	defer r.Mutex.Unlock()

	roomID := generateID(8)

	r.Map[roomID] = []Participant{}

	return roomID
}

func (r *RoomMap) InsertIntoRoom(roomID string, peerID string, host bool, conn *websocket.Conn) {
	r.Mutex.Lock()
	defer r.Mutex.Unlock()

	p := Participant{ID: peerID, Host: host, Conn: conn}

	log.Println("Inserting into Room with RoomID: ", roomID)
	r.Map[roomID] = append(r.Map[roomID], p)
}

func (r *RoomMap) RemoveFromRoom(roomID string, conn *websocket.Conn) string {
	r.Mutex.Lock()
	defer r.Mutex.Unlock()

	clients := r.Map[roomID]
	for i, client := range clients {
		if client.Conn == conn {
			id := client.ID
			r.Map[roomID] = append(clients[:i], clients[i+1:]...)
			return id
		}
	}
	return ""
}

func (r *RoomMap) DeleteRoom(roomID string) {
	r.Mutex.Lock()
	defer r.Mutex.Unlock()
	delete(r.Map, roomID)
}

// GetPeerIDs returns the peer IDs of all participants in a room, optionally excluding one.
func (r *RoomMap) GetPeerIDs(roomID string, exclude string) []string {
	r.Mutex.RLock()
	defer r.Mutex.RUnlock()

	ids := []string{}
	for _, p := range r.Map[roomID] {
		if p.ID != exclude {
			ids = append(ids, p.ID)
		}
	}
	return ids
}

// GetConnByPeerID returns the connection for a specific peer in a room.
func (r *RoomMap) GetConnByPeerID(roomID string, peerID string) *websocket.Conn {
	r.Mutex.RLock()
	defer r.Mutex.RUnlock()

	for _, p := range r.Map[roomID] {
		if p.ID == peerID {
			return p.Conn
		}
	}
	return nil
}

func GeneratePeerID() string {
	return generateID(12)
}

func generateID(length int) string {
	var letters = []rune("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890")
	b := make([]rune, length)
	for i := range b {
		b[i] = letters[rand.Intn(len(letters))]
	}
	return string(b)
}
