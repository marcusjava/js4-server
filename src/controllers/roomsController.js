import Attendee from "../entities/attendee.js";
import Room from "../entities/room.js";
import { constants } from "../util/constants.js";
import CustomMap from "../util/customMap.js";

class RoomsController {
  #users = new Map();
  constructor({ roomsPubSub }) {
    this.rooms = new CustomMap({
      observer: this.#roomObserver(),
      customMapper: this.#mapRoom.bind(this),
    });
    this.roomsPubSub = roomsPubSub;
  }

  #roomObserver() {
    return {
      notify: (rooms) => {
        console.log({ rooms });
        this.notifyRoomSubscribers(rooms);
      },
    };
  }

  onNewConnection(socket) {
    const { id } = socket;
    console.log("connection started with id " + id);
    this.#updateGlobalUserData(id);
  }

  notifyRoomSubscribers(rooms) {
    const event = constants.events.LOBBY_UPDATED;
    this.roomsPubSub.emit(event, [...rooms.values()]);
  }

  disconnect(socket) {
    console.log("diconnecting!!", socket.id);
    this.#logoutUser(socket);
  }

  #logoutUser(socket) {
    const userId = socket.id;
    const user = this.#users.get(userId);
    const roomId = user.roomId;
    // removendo user da lista
    this.#users.delete(userId);
    if (!this.rooms.has(roomId)) {
      return;
    }
    const room = this.rooms.get(roomId);
    const userToBeRemoved = [...room.users].find(({ id }) => id === userId);

    room.users.delete(userToBeRemoved);
    //atualizando a sala
    this.rooms.set(roomId, room);

    // se for o ultimo usuario na sala a mesma deve ser excluida
    if (!room.users.size) {
      this.rooms.delete(roomId);
      return;
    }

    //descobrindo se o usuario que saiu é o dono da sala
    const deletedIsRoomOwner = userId === room.owner.id;
    const onlyOneUserLeft = room.users.size === 1;

    // validar se tem somente um usuario ou se era o dono da salaries
    if (onlyOneUserLeft || deletedIsRoomOwner) {
      room.owner = this.#getNewRoomOwner(room, socket);
    }

    //atualizando a room
    this.rooms.set(roomId, room);

    // notificando a sala
    socket.to(roomId).emit(constants.events.USER_DISCONNECTED, user);
  }

  #notifyUserProfileUpdate(socket, roomId, user) {
    socket.to(roomId).emit(constants.events.UPGRADE_USER_PERMISSION, user);
  }

  #getNewRoomOwner(room, socket) {
    //tipo set
    const users = [...room.users.values()];
    //usando find para retornar o mais antigo
    const activeSpeakers = users.find((user) => user.isSpeaker);
    //se quem desconectou era o owner passa para o proximo
    const [newOwner] = activeSpeakers ? [activeSpeakers] : users;
    newOwner.isSpeaker = true;
    const outdatedUser = this.#users.get(newOwner.id);
    const updatedUser = new Attendee({
      ...outdatedUser,
      ...newOwner,
    });
    this.#users.set(newOwner.id, updatedUser);

    this.#notifyUserProfileUpdate(socket, room.id, newOwner);

    return newOwner;
  }

  joinRoom(socket, { user, room }) {
    const userId = (user.id = socket.id);
    const roomId = room.id;

    const updatedUserData = this.#updateGlobalUserData(userId, user, roomId);

    const updatedRoom = this.#joinUserRoom(socket, updatedUserData, room);
    this.#notifyUsersOnRoom(socket, roomId, updatedUserData);
    this.#replyWithActiveUsers(socket, updatedRoom.users);
  }

  #updateGlobalUserData(userId, userData = {}, roomId = "") {
    const user = this.#users.get(userId) ?? {};
    const existingRoom = this.rooms.has(roomId);
    const updatedUserData = new Attendee({
      ...user,
      ...userData,
      roomId,
      isSpeaker: !existingRoom,
    });
    this.#users.set(userId, updatedUserData);
    return this.#users.get(userId);
  }

  #replyWithActiveUsers(socket, users) {
    const event = constants.events.LOBBY_UPDATED;
    socket.emit(event, [...users.values()]);
  }

  #joinUserRoom(socket, user, room) {
    const roomId = room.id;
    const existingRoom = this.rooms.has(roomId);
    const currentRoom = existingRoom ? this.rooms.get(roomId) : {};

    const currentUser = new Attendee({
      ...user,
      roomId,
    });

    //definindo quem é o dono da sala
    const [owner, users] = existingRoom
      ? [currentRoom.owner, currentRoom.users]
      : [currentUser, new Set()];

    const updatedRoom = this.#mapRoom({
      ...currentRoom,
      ...room,
      owner,
      users: new Set([...users, ...[currentUser]]),
    });
    console.log({ updatedRoom });
    this.rooms.set(roomId, updatedRoom);
    socket.join(roomId);

    return this.rooms.get(roomId);
  }

  #mapRoom(room) {
    const users = [...room.users.values()];
    const speakersCount = users.filter((user) => user.isSpeaker).length;
    const featuredAttendees = users.slice(0, 3);
    const mappedRoom = new Room({
      ...room,
      featuredAttendees,
      speakersCount,
      attendeesCount: room.users.size,
    });
    return mappedRoom;
  }

  #notifyUsersOnRoom(socket, roomId, user) {
    const event = constants.events.USER_CONNECTED;
    socket.to(roomId).emit(event, user);
  }

  speakAnswer(socket, { answer, user }) {
    const currentUser = this.#users.get(user.id);
    const updatedUser = new Attendee({
      ...currentUser,
      isSpeaker: answer,
    });
    this.#users.set(user.id, updatedUser);
    const roomId = user.roomId;
    const room = this.rooms.get(roomId);
    const userOnRoom = [...room.users.values()].find(
      ({ id }) => id === user.id
    );
    room.users.delete(userOnRoom);
    room.users.add(updatedUser);
    this.rooms.set(roomId, room);

    socket.emit(constants.events.UPGRADE_USER_PERMISSION, updatedUser);

    //notifica toda sala sobre o novo speaker
    this.#notifyUserProfileUpdate(socket, roomId, updatedUser);
  }

  speakRequest(socket) {
    const userId = socket.id;
    const user = this.#users.get(userId);
    const roomId = user.roomId;

    const owner = this.rooms.get(roomId)?.owner;
    socket.to(owner.id).emit(constants.events.SPEAK_REQUEST, user);
  }

  getEvents() {
    //pegando o mome das funcoes publicas
    const functions = Reflect.ownKeys(RoomsController.prototype)
      .filter((fn) => fn !== "constructor")
      .map((name) => [name, this[name].bind(this)]);

    return new Map(functions);
  }
}

export default RoomsController;
