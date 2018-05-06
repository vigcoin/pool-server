export * from './server';

import { MiningServer } from "./server";


process.on('message', function (message) {
  switch (message.type) {
    case 'banIP':
      MiningServer.banned[message.ip] = Date.now();
      break;
  }
});
