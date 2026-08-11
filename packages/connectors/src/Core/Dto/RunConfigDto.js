/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

class RunConfigDto {
  constructor(config) {
    this._config = config;
    this._type = config.type;
    this._data = config.data;
    this._state = config.state;
  }

  get config() {
    return this._config;
  }

  get type() {
    return this._type;
  }

  get data() {
    return this._data;
  }

  get state() {
    return this._state;
  }

  toObject() {
    return {
      type: this._type,
      data: this._data,
      state: this._state,
    };
  }
}