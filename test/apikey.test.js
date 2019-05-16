const ApiKey = require('../lib/apikey.js');


test( 'Create ApiKey instance', ()=>{
  const apiKey = new ApiKey('testId',['group1','group2']);
  expect( apiKey ).not.toBe( undefined );
  expect( apiKey.id ).toEqual( 'testId' );
  expect( apiKey.groups ).toEqual( ['group1','group2'] );
  expect( apiKey.key ).toBe( undefined );
  expect( apiKey.script ).toEqual( 'eval ugroups_${kapi_id}=${kapi_groups};eval ukey_${kapi_id}=${kapi_key}' );
});

test( 'Create ApiKey instance and randomise it', async ()=>{
  const apiKey = new ApiKey('testId',['group1','group2']);
  await apiKey.randomiseKey();
  expect( apiKey ).not.toBe( undefined );
  expect( apiKey.id ).toEqual( 'testId' );
  expect( apiKey.groups ).toEqual( ['group1','group2'] );
  expect( apiKey.key ).not.toBe( undefined );
  expect( apiKey.script ).toEqual( 'eval ugroups_${kapi_id}=${kapi_groups};eval ukey_${kapi_id}=${kapi_key}' );
});

test( 'Create ApiKey instance, randomise it and use getters', async ()=>{
  const apiKey = new ApiKey('testId',['group1','group2']);
  await apiKey.randomiseKey();
  const keyString = apiKey.getKey();
  const script = apiKey.script;
  expect( keyString ).not.toBe( undefined );
  expect( apiKey.id ).toEqual( 'testId' );
  expect( apiKey.getClientInformation() ).toEqual( 'testId='+keyString );
  expect( apiKey.getConfigEntry() ).toEqual( `kapi_id="testId";kapi_key="${keyString}";kapi_groups="group1,group2";${script}` );
});

