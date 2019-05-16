const Config = require('../lib/config.js');

const configV010 = require('./data/config.v1.json');
const configV020 = require('./data/config.v2.json');

test( 'create config v0.1.0', () => {
  const config = new Config(configV010);
});


test( 'create config v0.2.0', () => {
  const config = new Config(configV020);
});


test( 'validate config v0.1.0', () => {
  const config = new Config(configV010);
  config.data.foo = "bar";
  config.data.bar = "foo";
  config.validate();
  expect( config.data.foo ).toBe( undefined );
  expect( config.data.bar ).toBe( undefined );
});


test( 'validate config v0.2.0', () => {
  const config = new Config(configV020);
  config.data.foo = "bar";
  config.data.bar = "foo";
  config.validate();
  expect( config.data.foo ).toBe( undefined );
  expect( config.data.bar ).toBe( undefined );
});
