import { constants } from "../util/constants.js";

class LobbyController {
  constructor({ activeRooms, roomsListener }) {
    this.activeRooms = activeRooms;
    this.roomsListener = roomsListener;
  }

  onNewConnection(socket) {
    const { id } = socket;
    console.log("Lobby connection started with id " + id);
    this.#updateLobbyRooms(socket, [...this.activeRooms.values()]);
    this.#activateEventProxy(socket);
  }

  #activateEventProxy(socket) {
    this.roomsListener.on(constants.events.LOBBY_UPDATED, (rooms) => {
      this.#updateLobbyRooms(socket, rooms);
    });
  }

  disconnect(socket) {
    console.log("diconnecting!!", socket.id);
  }

  #updateLobbyRooms(socket, activeRooms) {
    socket.emit(constants.events.LOBBY_UPDATED, activeRooms);
  }

  getEvents() {
    //pegando o mome das funcoes publicas
    const functions = Reflect.ownKeys(LobbyController.prototype)
      .filter((fn) => fn !== "constructor")
      .map((name) => [name, this[name].bind(this)]);

    return new Map(functions);
  }
}
export default LobbyController;
