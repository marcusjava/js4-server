import http from "http";
import { Server } from "socket.io";
import { constants } from "./constants.js";

class SocketServer {
  #io;
  constructor({ port }) {
    this.port = port;
    this.namespaces = {};
  }

  attachEvents({ routeConfig }) {
    for (const routes of routeConfig) {
      for (const [namespace, { events, eventEmitter }] of Object.entries(
        routes
      )) {
        const route = (this.namespaces[namespace] = this.#io.of(
          `/${namespace}`
        ));
        route.on("connection", (socket) => {
          for (const [fnName, fnValue] of events) {
            socket.on(fnName, (...args) => fnValue(socket, ...args));
            console.log(fnName);
          }

          eventEmitter.emit(constants.events.USER_CONNECTED, socket);
        });
      }
    }
  }

  async start() {
    const server = http.createServer((req, res) => {
      res.writeHead(200, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "OPTIONS,POST,GET",
      });
      res.end("works");
    });
    this.#io = new Server(server, {
      cors: {
        origin: "*",
        credentials: false,
      },
    });

    /* const room = this.#io.of("/room");
    room.on("connection", (socket) => {
      socket.emit("userConnection", "socket id connected" + socket.id);
      socket.on("joinRoom", (data) => {
        console.log("data received!!!", data);
      });
    }); */
    return new Promise((resolve, reject) => {
      server.on("error", reject);
      server.listen(this.port, () => resolve(server));
    });
  }
}

export default SocketServer;
