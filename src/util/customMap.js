//extendendo o Map

export default class CustomMap extends Map {
  #observer;
  #customMapper;
  constructor({ observer, customMapper }) {
    super();
    this.#observer = observer;
    this.#customMapper = customMapper;
  }

  set(...args) {
    const result = super.set(...args);
    console.log("custom map ", this);
    this.#observer.notify(this);
    return result;
  }

  //iterator - processa sob demanda
  *values() {
    for (const value of super.values()) {
      yield this.#customMapper(value);
    }
  }

  delete(...args) {
    const result = super.delete(...args);
    this.#observer.notify(this);
    return result;
  }
}
