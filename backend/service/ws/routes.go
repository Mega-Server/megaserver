package ws

import "net/http"

func (app *application) routes() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("/create", app.createRoomRequestHandler)
	mux.HandleFunc("/join", app.joinRoomRequestHandler)
	mux.HandleFunc("/", app.notFoundResponse)

	return mux
}
