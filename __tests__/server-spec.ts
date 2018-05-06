import { MiningServer } from '../src/server';

test('Should greet with message', () => {
  const server = new MiningServer('friend');
  expect(server).toBeTruthy();
});
