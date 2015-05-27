'use strict';

describe('Service: Spotify', function () {

  // load the service's module
  beforeEach(module('shufflifyApp'));

  // instantiate service
  var Spotify;
  beforeEach(inject(function (_Spotify_) {
    Spotify = _Spotify_;
  }));

  it('should do something', function () {
    expect(!!Spotify).toBe(true);
  });

});
