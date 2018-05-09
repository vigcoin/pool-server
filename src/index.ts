export * from './server';

import { MiningServer } from "./server";


export function onMessage(message: any) {
  switch (message.type) {
    case 'banIP':
      MiningServer.banned[message.ip] = Date.now();
      break;
  }
}

process.on('message', onMessage);
