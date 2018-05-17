import { MiningServer, onMessage } from '../src/index';
import * as EventEmitter from 'events';

test('Should have Server available', () => {
  expect(MiningServer).toBeTruthy();
});

test('Should process message', done => {
  const ip = 'aaa';
  expect(MiningServer.banned[ip]).toBeFalsy();

  const ev = new EventEmitter();
  ev.on('message', message => {
    onMessage(message);
    expect(MiningServer.banned[ip]).toBeTruthy();
    done();
  });
  ev.emit('message', { type: 'banIP', ip });
});
