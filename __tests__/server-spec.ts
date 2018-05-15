import { MiningServer } from '../src/server';
import { RedisClient } from 'redis';
import { ConfigReader } from '@vigcoin/conf-reader';
import { Logger } from '@vigcoin/logger';
import { PoolRequest } from '@vigcoin/pool-request';

import { spawn } from "child_process";

import { onMessage, BlockTemplate } from "../src/index";
import { Miner } from "../src/miner";

import * as EventEmitter from "events";
import * as request from "supertest";
import * as net from "net";

import * as path from 'path';


const file = path.resolve(__dirname, './config.json');
const reader = new ConfigReader(file);
const { config } = reader.get();

const redis = new RedisClient({});
const logger = new Logger(config.logger);
const pr = new PoolRequest(config.daemon, config.wallet, config.api);
const server = new MiningServer(config, logger, pr, redis);

let { banning, minerTimeout } = config.poolServer;

let id;

test('Should create', () => {
  BlockTemplate.currentBlockTemplate = null;
  BlockTemplate.validBlockTemplates = [];
  expect(server).toBeTruthy();
});

test('Should  start', (done) => {
  server.start();
  setTimeout(() => {
    server.stop();
    done();
  }, 1500);
});

test('Should  start', (done) => {
  config.poolServer.timeoutInterval = 100;
  server.start();
  setTimeout(() => {
    server.stop();
    done();
  }, 1500);
});

test('Should  listen', async () => {
  try {
    await server.listen();

  } catch (e) {
    console.log(e);
  }
  server.closeAll();
});

test('Should  check timedout miners', (done) => {
  server.checkTimeOutMiners();
  setTimeout(() => {
    done();
  }, 1000);
});

test('Should  check timedout miners', (done) => {
  MiningServer.connectedMiners['aaa'] = {
    lastBeat: Date.now(),
    timeout: () => {
    }
  };
  setTimeout(() => {
    server.removeTimeout(Date.now(), banning, minerTimeout);
    done();
  }, 1000);
});

test('Should  check timedout miners', () => {
  MiningServer.connectedMiners['aaa'] = {
    lastBeat: Date.now(),
    timeout: () => {
    }
  };
  server.removeTimeout(Date.now(), banning, minerTimeout);
});


test('Should  retarget miners', (done) => {
  MiningServer.connectedMiners['aaa'] = {
    noRetarget: true,
    retarget: () => {
    }
  };

  MiningServer.connectedMiners['bbb'] = {
    noRetarget: false,
    retarget: () => {
    }
  };
  server.retargetMiners();
  setTimeout(() => {
    done();
  }, 1000);
});

test('Should  check timedout miners', (done) => {
  MiningServer.banned['aaa'] = Date.now();
  setTimeout(() => {
    server.removeBanned(Date.now(), banning);
    done();
  }, 1000);
});

test('Should  check timedout miners', () => {
  MiningServer.banned['aaa'] = Date.now();
  server.removeBanned(Date.now(), banning);
});

test('Should  check timedout miners', () => {
  server.removeBanned(Date.now(), null);
});

test('Should  check is banned', (done) => {
  console.log("banned");
  MiningServer.banned['aaa'] = Date.now();
  MiningServer.banned['bbb'] = Date.now();

  expect(MiningServer.isBanned('ccc', config)).toBe(1);
  expect(MiningServer.isBanned('aaa', config)).toBe(0);
  setTimeout(() => {
    expect(MiningServer.isBanned('bbb', config)).toBe(-1);
    done();
  }, 500)
});

test('Should  check banned', () => {
  process.send = function () { };
  server.checkBan(true, { ip: 'ip', id: 'id', address: 'address' })
  server.checkBan(true, { ip: 'ip', id: 'id', address: 'address' })
  server.checkBan(true, { ip: 'ip', id: 'id', address: 'address' })
  server.checkBan(false, { ip: 'ip', id: 'id', address: 'address' });
  config.poolServer.banning.enabled = false;
  server.checkBan(false, { ip: 'ip', id: 'id', address: 'address' });
  config.poolServer.banning.enabled = true;

});

test('Should  check banned', () => {
  process.send = null;
  MiningServer.perIPStats = {};
  server.checkBan(true, { ip: 'ip', id: 'id', address: 'address' })
  server.checkBan(true, { ip: 'ip', id: 'id', address: 'address' })
  server.checkBan(true, { ip: 'ip', id: 'id', address: 'address' })
  server.checkBan(false, { ip: 'ip', id: 'id', address: 'address' });
  config.poolServer.banning.enabled = false;
  server.checkBan(false, { ip: 'ip', id: 'id', address: 'address' });
});


test('Should  listen', async () => {
  try {
    await server.listen();

  } catch (e) {
    console.log(e);
  }
});

test('Should  response to request', (done) => {
  for (const { port, difficulty } of config.poolServer.ports) {
    const client = net.connect(port, function () {
      client.write("hello");
      setTimeout(() => {
        done();
      }, 500)
    });
    break;
  }
});

test('Should  close socket flooding', (done) => {
  for (const { port, difficulty } of config.poolServer.ports) {
    const client = net.connect(port, function () {
      const buffer = new Buffer(1024 * 11);
      client.write(buffer);
      setTimeout(() => {
        done();
      }, 500)
    });
    break;
  }
});

// Socket Handling
test('Should sending', (done) => {
  for (const { port, difficulty } of config.poolServer.ports) {
    const client = net.connect(port, function () {
      const buffer = Buffer.from('hsos\nsososss');
      client.write(buffer);
      setTimeout(() => {
        done();
      }, 500)
    });
    break;
  }
});

test('Should sending', (done) => {
  for (const { port, difficulty } of config.poolServer.ports) {
    const client = net.connect(port, function () {
      const buffer = Buffer.from('{"aa": 111}\nsososss');
      client.write(buffer);
      setTimeout(() => {
        done();
      }, 500)
    });
    break;
  }
});

test('Should sending', (done) => {
  for (const { port, difficulty } of config.poolServer.ports) {
    const client = net.connect(port, function () {
      const buffer = Buffer.from('{"method": "send"}\nsososss');
      client.write(buffer);
      setTimeout(() => {
        done();
      }, 500)
    });
    break;
  }
});

test('Should sending HTTP/1.1', (done) => {
  for (const { port, difficulty } of config.poolServer.ports) {
    const client = net.connect(port, function () {
      const buffer = Buffer.from('GET / HTTP/1.1 GET /\nsososss');
      client.write(buffer);
      setTimeout(() => {
        done();
      }, 500)
    });
    break;
  }
});

test('Should sending HTTP/1.0', (done) => {
  for (const { port, difficulty } of config.poolServer.ports) {
    const client = net.connect(port, function () {
      const buffer = Buffer.from('GET / HTTP/1.0 GET /\nsososss');
      client.write(buffer);
      client.on("data", (data) => {
        console.log(String(data));
        const headers = String(data).split("\n");
        expect(headers[0]).toBe('HTTP/1.0 200 OK');
        expect(headers[1]).toBe('Content-Type: text/plain');
        expect(headers[2]).toBe('Content-Length: 20');
        expect(headers[4]).toBe('mining server online');
        done();
      });
    });
    break;
  }
});

test('Should sending HTTP/1.0 1', (done) => {
  for (const { port, difficulty } of config.poolServer.ports) {
    const client = net.connect(port, function () {
      const buffer = Buffer.from('{"ss": "ge"}\n');
      client.write(buffer);
    });
    client.on("data", (data) => {
      console.log(String(data));
      done();
    });
    setTimeout(() => {
      done();
    }, 500);
    break;
  }
});

test('Should sending HTTP/1.0 1', (done) => {
  for (const { port, difficulty } of config.poolServer.ports) {
    const client = net.connect(port, function () {
      const buffer = Buffer.from('{"method": "ge"}\n');
      try {
        client.write(buffer);
      } catch (e) {
        console.log(e);
      }
    });
    setTimeout(() => {
      done();
    }, 500);
    break;
  }
});

test('Should sending HTTP/1.0 1', (done) => {
  for (const { port, difficulty } of config.poolServer.ports) {
    const client = net.connect(port, function () {
      const buffer = Buffer.from('{"method": "login", "id": "aaa", "params": {"id": "10"}}\n');
      client.write(buffer);
    });
    client.on("data", (data) => {
      console.log(String(data));
      const list = String(data).split("\n");

      expect(list[0]).toBe('{"id":"aaa","jsonrpc":"2.0","error":{"code":-1,"message":"missing login"},"result":null}');
      done();
    });
    break;
  }
});

test('Should sending HTTP/1.0 1', (done) => {
  for (const { port, difficulty } of config.poolServer.ports) {
    const client = net.connect(port, function () {
      const buffer = Buffer.from('{"method": "login", "id": "aaa111", "params": {"id": "10", "login": "aaa111"}}\n');
      client.write(buffer);
    });
    client.on("data", (data) => {
      console.log(String(data));

      const list = String(data).split("\n");
      console.log(list);
      const json = JSON.parse(list[0]);
      expect(json.id).toBe("aaa111");
      expect(json.jsonrpc).toBe("2.0");
      expect(json.error).toBe(null);
      expect(json.result.id).toBeTruthy();
      expect(json.result.job).toBeTruthy();
      expect(json.result.status).toBe("OK");
      id = json.result.id;
      done();
    });
    break;
  }
});

test('Should sending HTTP/1.0 2', (done) => {
  for (const { port, difficulty } of config.poolServer.ports) {
    const client = net.connect(port, function () {
      const buffer = Buffer.from('{"method": "ge", "id": "aaa111", "params": {"id": "10"}}\n\n\nsososss');
      client.write(buffer);
    });
    client.on("data", (data) => {
      console.log(String(data));
      done();
    });
    break;
  }
});

test('Should sending HTTP/1.0 2', (done) => {
  for (const { port, difficulty } of config.poolServer.ports) {
    const client = net.connect(port, function () {
      const buffer = Buffer.from('{"method": "ge", "id": "aaa111", "params": {"id": "' + id + '"}}\n\n\nsososss');
      client.write(buffer);
    });
    client.on("data", (data) => {
      console.log(String(data));
      done();
    });
    break;
  }
});

test('Should sending HTTP/1.0 3', (done) => {
  for (const { port, difficulty } of config.poolServer.ports) {
    const client = net.connect(port, function () {
      const buffer = Buffer.from('{"method": "keepalived", "id": "aaa111", "params": {"id": "' + id + '"}}\n\n\nsososss');
      client.write(buffer);
    });
    client.on("data", (data) => {
      console.log(String(data));
      done();
    });
    break;
  }
});

test('Should sending HTTP/1.0 4', (done) => {
  for (const { port, difficulty } of config.poolServer.ports) {
    const client = net.connect(port, function () {
      const buffer = Buffer.from('{"method": "getjob", "id": "aaa111", "params": {"id": "' + id + '"}}\n\n\nsososss');
      client.write(buffer);
    });
    client.on("data", (data) => {
      console.log(String(data));

      done();
    });
    break;
  }
});

test('Should sending HTTP/1.0 4', (done) => {
  for (const { port, difficulty } of config.poolServer.ports) {
    const client = net.connect(port, function () {
      const buffer = Buffer.from('{"method": "submit", "id": "aaa111", "params": {"id": "' + id + '"}}\n\n\nsososss');
      client.write(buffer);
    });
    client.on("data", (data) => {
      console.log(String(data));

      done();
    });
    break;
  }
});

test('Should sending HTTP/1.0 4', (done) => {
  const ip = '::ffff:127.0.0.1';
  MiningServer.banned[ip] = Date.now();
  for (const { port, difficulty } of config.poolServer.ports) {
    const client = net.connect(port, function () {
      const buffer = Buffer.from('{"method": "submit", "id": "aaa111", "params": {"id": "' + id + '"}}\n\n\nsososss');
      client.write(buffer);
    });
    client.on("data", (data) => {
      console.log(String(data));

      done();
    });
    break;
  }
});

test('Should sending HTTP/1.0 4', (done) => {
  const ip = '::ffff:127.0.0.1';
  MiningServer.banned[ip] = Date.now() - config.poolServer.banning.time * 1000 - 1000;
  for (const { port, difficulty } of config.poolServer.ports) {
    const client = net.connect(port, function () {
      const buffer = Buffer.from('{"method": "submit", "id": "aaa111", "params": {"id": "' + id + '"}}\n\n\nsososss');
      client.write(buffer);
    });
    client.on("data", (data) => {
      console.log(String(data));

      done();
    });
    break;
  }
});

test('Should close all', () => {
  server.closeAll();
  redis.quit();
});

