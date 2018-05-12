export * from './server';
export * from './block-template';
export * from './miner';
export * from './socket-handler';


import { MiningServer } from "./server";


export function onMessage(message: any) {
  switch (message.type) {
    case 'banIP':
      MiningServer.banned[message.ip] = Date.now();
      break;
  }
}

process.on('message', onMessage);
