const App = require( './lib/app.js' );

const main = async () => {
  const app = new App();
  await app.start(  { noWizard: false, noSplashScreen: false } );
};

main();

