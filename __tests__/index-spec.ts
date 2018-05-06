import * as index from '../src/index';

test('Should have Server available', () => {
  expect(index.MiningServer).toBeTruthy();
});
