'use strict';

var deezerServices = angular.module('deezerServices', ['oauth']);


deezerServices.factory('DeezerRequester', ["$http", "AccessToken", "$q", function($http, AccessToken, $q) {
	var JSONP_CALLBACK = "JSON_CALLBACK";

	return {
		get: requestFactory("get"),
		post: requestFactory("post"),
		delete: requestFactory("delete")
	};

	function prepareJSONPUrl(url, data) {
		var access_token = AccessToken.get().access_token;
		var tempUrl = new Url(url);
		tempUrl.query.callback = JSONP_CALLBACK;
		tempUrl.query.access_token = access_token;
		tempUrl.query.output = "jsonp";

		Object.keys(data).forEach(function (key) {
			tempUrl.query[key] = data[key];
		});

		return tempUrl.toString();
	}

	function requestFactory(type) {
		return function (url, data) {
			data = data || {};
			data.request_method = type;
			var jsonpUrl = prepareJSONPUrl(url, data);
			return $http.jsonp(jsonpUrl).then(
				function(result) {
					if (result.data.error) {
						return $q.reject(result.data.error.message);
					} else {
						return result;
					}
				},
				function(error) {
					return $q.reject(error);
			    });
		};
	}
}]);


deezerServices.factory('DeezerProfile', ["$q", "DeezerRequester", function ($q, DeezerRequester) {
	var cache = null;

	return {
		load: loadProfile,
		get: getProfile,
	};

	function loadProfile(force) {
		if (cache == null || force) {
			return DeezerRequester.get("https://api.deezer.com/user/me").then(
				function(result) {
					cache = result.data;
					return result;
				},
				function (error) {
					return $q.reject(error);
				});
		}
	}
	
	function getProfile() {
		return cache;
	}
}]);

deezerServices.factory('DeezerPlaylist', ["$q", "DeezerRequester", "DeezerProfile", function ($q, DeezerRequester, DeezerProfile) {
	var cache = {
		playlists_info: []
	};

	return {
		getPlaylistsInfo: getPlaylistsInfo,
		getPlaylistTracks: getPlaylistTracks,
		setPlaylistTracks: setPlaylistTracks,
		addPlaylist: addPlaylist,
		clearPlaylist: clearPlaylist,
		addPlaylistTracks: addPlaylistTracks
	};

	function parsePlaylist(playlistData) {
		return {
			id: playlistData.id,
			name: playlistData.title,
			type: 'playlist',
			total: playlistData.nb_tracks,
			owner: playlistData.creator.id,
		};
	}

	function getPlaylistsInfo(force) {
		var deferred = $q.defer();
		var url = 'https://api.deezer.com/user/me/playlists?limit=50';

		function _getPlaylistsInfo() {
			DeezerRequester.get(url).then(
					function (result) {
						result.data.data.forEach(function (playlist) {
							var parsed_playlist = parsePlaylist(playlist);
							cache.playlists_info.push(parsed_playlist);
						});

						if (result.data.next) {
							url = result.data.next;
							_getPlaylistsInfo();
						} else {
							sortPlaylists();
							deferred.resolve(cache.playlists_info);
						}
					},
					function (error) {
						deferred.reject(error);
					});
		}


		if (cache.playlists_info.length > 0 && !force) {
			deferred.resolve(cache.playlists_info);
		} else {
			cache.playlists_info = [];
			_getPlaylistsInfo();
		}

		return deferred.promise;
	}

	function getPlaylistTracks(playlist_id, positions) {
		var deferred = $q.defer();
		var playlist_tracks = [];
		var url = 'https://api.deezer.com/playlist/' + playlist_id + '/tracks';

		function _getSomePlaylistTracks(requests) {
			if (requests.length <= 0) {
				deferred.resolve(playlist_tracks);
				return;
			}

			var current_request = requests.shift();
			DeezerRequester.get(url, {offset: current_request.offset, limit: current_request.limit}).then(
					function (result) {
						var handled = 0;

						for (var i = 0; i < result.data.data.length; ++i) {
							// We are only interested in some of the tracks in the playlist, not all.
							// Skip those we are not interested in.
							if (!(i in current_request.items)) {
								console.log("Skipping " + i);
								continue;
							}

							var playlist_track = result.data.data[i];

							// TODO: Deezer Web API bug
							if (playlist_track.id == null) {
								continue;
							}

							playlist_tracks.push(playlist_track.id);
							++handled;
						}

						deferred.notify({
							delta: handled,
							current: playlist_tracks.length,
							total: positions.length
						});

						_getSomePlaylistTracks(requests);
					},
					function (error) {
						deferred.reject(error);
					});
		}

		function _getAllPlaylistTracks() {
			//$http.get(url, {params: {fields: fields}}).then(
			// TODO: Temporarily removed fields parameter due to Deezer Web API bug
			DeezerRequester.get(url).then(
					function (result) {
						var handled = 0;

						result.data.data.forEach(function (playlist_track) {
							if (playlist_track.id == null) {
								return;
							}

							playlist_tracks.push(playlist_track.id);
							++handled;
						});

						deferred.notify({
							delta: handled,
							current: playlist_tracks.length,
							total: result.total
						});

						if (result.data.next) {
							url = result.data.next;
							_getAllPlaylistTracks();
						} else {
							deferred.resolve(playlist_tracks);
						}
					},
					function (error) {
						deferred.reject(error);
					});
		}

		if (positions) {
			var requests = [];
			var current_request = null;
			var MAX_TRACKS_PER_REQUEST = 100;

			positions.forEach(function (position) {
				// If a request is currently being defined
				if (current_request) {
					// If adding this position would violate the API limits, save existing
					// request and later on create a new one.
					if (position - current_request.offset + 1 > MAX_TRACKS_PER_REQUEST) {
						requests.push(current_request);
						current_request = null;
					}
					// Else, if we can add this position to the request and respect API limits,
					// do so...
					else {
						current_request.limit = position - current_request.offset + 1;
						current_request.items.push(position - current_request.offset);
					}
				}

				// If no request currently being defined, create new
				if (!current_request) {
					current_request  = {
						offset: position,
						limit: 1,
						items: [0]
					}
				}
			});

			// If we have a current_request left over, add it to the request list
			if (current_request) {
				requests.push(current_request);
			}

			_getSomePlaylistTracks(requests);
		} else {
			_getAllPlaylistTracks();
		}

		return deferred.promise;
	}

	function clearPlaylist(playlist_id) {
		return getPlaylistTracks(playlist_id).then(
			function(result) {
				var track_uris = result;
				return deletePlaylistTracks(playlist_id, track_uris);
			},
			function(error) {
				return $q.reject(error);
			});
	}

	function deletePlaylistTracks(playlist_id, track_uris) {
		var MAX_TRACKS_PER_REQUEST = 50;

		var deferred = $q.defer();
		var initial_num_tracks = track_uris.length;
		var num_tracks_deleted = 0;
		var url = 'https://api.deezer.com/playlist/' + playlist_id + '/tracks';

		function _deletePlaylistTracks(track_uris) {
			if (track_uris.length <= 0) {
				deferred.resolve(num_tracks_deleted);
				return;
			}

			var current_batch = track_uris.splice(0, MAX_TRACKS_PER_REQUEST);
			DeezerRequester.delete(url, {songs: current_batch.join()}).then(
					function (result) {
						num_tracks_deleted += current_batch.length;
						deferred.notify({
							delta: current_batch.length,
							current: num_tracks_deleted,
							total: initial_num_tracks
						});
						_deletePlaylistTracks(track_uris);
					},
					function (error) {
						deferred.reject(error);
					});
		}

		_deletePlaylistTracks(track_uris);

		return deferred.promise.then(
			function (data) {
				for (var i = 0; i < cache.playlists_info.length; ++i) {
					var playlist_info = cache.playlists_info[i];

					if (playlist_info.id == playlist_id) {
						playlist_info.total = initial_num_tracks - num_tracks_deleted;
						break;
					}
				}
			},
			function (error) {
				return $q.reject(error);
			});
	}

	function addPlaylistTracks(playlist_id, track_uris) {
		var MAX_TRACKS_PER_REQUEST = 50;

		var deferred = $q.defer();
		var num_tracks_added = 0;
		var num_tracks_to_add = track_uris.length;
		var url = 'https://api.deezer.com/playlist/' + playlist_id + '/tracks';

		function _addPlaylistTracks(track_uris) {
			if (track_uris.length <= 0) {
				deferred.resolve(num_tracks_added);
				return;
			}

			var current_batch = track_uris.splice(0, MAX_TRACKS_PER_REQUEST);
			DeezerRequester.post(url, {songs: current_batch.join()}).then(
					function (result) {
						num_tracks_added += current_batch.length;
						deferred.notify({
							delta: current_batch.length,
							current: num_tracks_added,
							total: num_tracks_to_add
						});
						_addPlaylistTracks(track_uris);
					},
					function (error) {
						deferred.reject(error);
					});
		}

		_addPlaylistTracks(track_uris);

		return deferred.promise.then(
			// Success
			function () {
				for (var i = 0; i < cache.playlists_info.length; ++i) {
					var playlist_info = cache.playlists_info[i];

					if (playlist_info.id == playlist_id) {
						playlist_info.total = num_tracks_added;
						break;
					}
				}
			},
			// Error
			function (error) {
				return $q.reject(error);
			});
	}

	function setPlaylistTracks(playlist_id, track_uris) {
		return clearPlaylist(playlist_id).then(
			// Success
			function () {
				return addPlaylistTracks(playlist_id, track_uris);
			},
			// Error
			function (error) {
				return $q.reject(error);
			});
	}

	function addPlaylist(name) {
		var deferred = $q.defer();

		var promise = DeezerRequester.post('https://api.deezer.com/user/' + DeezerProfile.get().id + '/playlists', {
			title: name,
		});

		return promise.then(function (result) {
			console.log(result);
			var playlist = {
				id: result.data.id,
				name: name,
				type: 'playlist',
				total: 0,
				owner: DeezerProfile.get().id,
			};
			cache.playlists_info.push(playlist);
			sortPlaylists();
			return playlist;
		});
	}

	function sort_by(field, reverse, primer) {
		var key = function (x) {
			return primer ? primer(x[field]) : x[field]
		};
		return function (a, b) {
			var A = key(a), B = key(b);
			return (
					(A < B) ? -1 : (
							(A > B) ? 1 : (
									(typeof then === 'function') ? then(a, b) : 0
							)
					)
			) * [1, -1][+!!reverse];
		};
	}

	function sortPlaylists() {
		cache.playlists_info.sort(sort_by('name'));
	}
}]);
