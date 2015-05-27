'use strict';

var shuffleezerApp = angular.module('shuffleezerApp');

shuffleezerApp.controller('MainCtrl', ["$scope", "$http", "$location", "DeezerProfile", "DeezerPlaylist", "AccessToken", "$modal", "$q", "$rootScope", function ($scope, $http, $location, DeezerProfile, DeezerPlaylist, AccessToken, $modal, $q, $rootScope) {
	$scope.host = $location.host();
	$scope.localhost = $scope.host == '127.0.0.1' || $scope.host == 'localhost';

	$rootScope.deezerData = {
		playlists: []
	};

	$scope.selectionData = {
		sources: [],
		totalSongsInSources: 0,
		destination: null,
		totalSongsInDestination: 0,
		maxSongsDestination: null,
		// Deezer does not support duplicates
		ensureUnique: true
	};

	$scope.newPlaylistName = "";
	$rootScope.profile = null;
	$rootScope.gettingPlaylists = false;

	$scope.$on('oauth:logout', forgetProfile);
	$scope.$on('oauth:expired', forgetProfile);
	$scope.$on('oauth:denied', forgetProfile);
	$scope.$on('oauth:authorized', loadProfile);
	//$scope.$on('oauth:profile', loadProfile);

	function loadProfile(event, profile) {
		if ($rootScope.profile) {
			return;
		}
		console.log("AccessToken: " + AccessToken.get().access_token);
		DeezerProfile.load().then(
			// Success
			function (data) {
				if ($rootScope.profile) {
					return;
				} 
				$rootScope.profile = DeezerProfile.get();
				console.log("Load profile success");
				console.log($rootScope.profile);
				$http.defaults.headers.common.Authorization = 'Bearer ' + AccessToken.get().access_token;
				$scope.loadDeezerData();
			},
			// Error
			function (error) {
				console.log("Error loading profile: " + error);
				$rootScope.$broadcast('oauth:expired');
			}
		);
	}

	function forgetProfile() {
		if ($rootScope.profile == null) {
			return;
		}
		console.log("Forget profile: " + $rootScope.profile);
		$rootScope.profile = null;
		$http.defaults.headers.common.Authorization = null;
		AccessToken.destroy();
	}

	$scope.loadDeezerData = function () {
		if ($rootScope.deezerData.playlists.length > 0 || $rootScope.gettingPlaylists) {
			return;
		}

		$rootScope.gettingPlaylists = true;

		DeezerPlaylist.getPlaylistsInfo(true).then(function (playlists) {
			$rootScope.deezerData.playlists = playlists;
			$rootScope.gettingPlaylists = false;
		});
	};

	$scope.$watchCollection('selectionData.sources', function () {
		var total = 0;

		$scope.selectionData.sources.forEach(function (source) {
			total += source.total;
		});

		$scope.selectionData.totalSongsInSources = total;
	});

	$scope.$watchCollection("[selectionData.totalSongsInSources, selectionData.maxSongsDestination]", function () {
		var maxSongsDestination = $scope.selectionData.maxSongsDestination;
		var totalSongsInSources = $scope.selectionData.totalSongsInSources;

		if ((!maxSongsDestination && maxSongsDestination !== 0) || maxSongsDestination < 0) {
			$scope.selectionData.totalSongsInDestination = totalSongsInSources;
		} else {
			$scope.selectionData.totalSongsInDestination = Math.min(maxSongsDestination, totalSongsInSources);
		}
	});

	$scope.selectAllSources = function () {
		$scope.selectionData.sources = angular.extend($rootScope.deezerData.playlists);
	};

	$scope.clearSourcesSelection = function () {
		$scope.selectionData.sources = undefined;
	};

	var addPlaylistDialogCtrl = ["$scope", "$modalInstance", "selectionData", function ($scope, $modalInstance, selectionData) {
		$scope.selectionData = selectionData;
		$scope.playlistInfo = {
			name: null
		};

		$scope.ok = function () {
			DeezerPlaylist.addPlaylist($scope.playlistInfo.name).then(function (playlist) {
				console.log(playlist);
				$modalInstance.close(playlist);
			});
		};

		$scope.cancel = function () {
			$modalInstance.dismiss('cancel');
		};
	}];

	$scope.addPlaylist = function (name) {
		var addPlaylistDialog = $modal.open({
			templateUrl: "views/add_playlist.html",
			controller: addPlaylistDialogCtrl,
			windowClass: "add-playlist-dialog",
			resolve: {
				selectionData: function () {
					return $scope.selectionData;
				}
			}
		});

		addPlaylistDialog.result.then(function (playlist) {
			$scope.selectionData.destination = playlist;
		});
	};

	var confirmDialogCtrl = ["$scope", "$modalInstance", "selectionData", function ($scope, $modalInstance, selectionData) {
		$scope.selectionData = selectionData;

		$scope.ok = function () {
			$modalInstance.close();
		};

		$scope.cancel = function () {
			$modalInstance.dismiss('cancel');
		};
	}];

	var progressDialogCtrl = ["$scope", "$modalInstance", "selectionData", function ($scope, $modalInstance, selectionData) {
		$scope.selectionData = selectionData;

		$scope.progressData = {
			phase: 0,
			total_songs_to_read: $scope.selectionData.ensureUnique ? $scope.selectionData.totalSongsInSources : $scope.selectionData.totalSongsInDestination,
			total_songs_to_write: $scope.selectionData.totalSongsInDestination,
			num_tracks_read: 0,
			num_tracks_written: 0,
			percent_tracks_read: 0,
			percent_tracks_written: 0,
			finished_read: false,
			finished_write: false,
			finished_clear: false,
			write_error: null,
			read_error: null,
			clear_error: null
		};

		$scope.$watchCollection("[progressData.num_tracks_read, progressData.total_songs_to_read]", function () {
			$scope.progressData.percent_tracks_read =
					$scope.progressData.num_tracks_read / $scope.progressData.total_songs_to_read * 100;
		});

		$scope.$watchCollection("[progressData.num_tracks_written, progressData.total_songs_to_write]", function () {
			$scope.progressData.percent_tracks_written =
					$scope.progressData.num_tracks_written / $scope.progressData.total_songs_to_write * 100;
		});

		$scope.$on("progress:tracks_read", function (event, delta) {
			$scope.progressData.num_tracks_read += delta;
		});

		$scope.$on("progress:finished_read", function () {
			$scope.progressData.finished_read = true;
			$scope.progressData.phase++;
		});

		$scope.$on("progress:finished_clear", function () {
			$scope.progressData.phase++;
		});

		$scope.$on("progress:tracks_written", function (event, delta) {
			console.log(delta);
			console.log($scope.progressData);
			$scope.progressData.num_tracks_written += delta;
		});

		$scope.$on("progress:finished_write", function () {
			$scope.progressData.finished_write = true;
			$scope.progressData.phase++;
		});

		$scope.$on("progress:read_error", function (event, error) {
			$scope.progressData.read_error = error;
		});

		$scope.$on("progress:write_error", function (event, error) {
			$scope.progressData.write_error = error;
		});

		$scope.$on("progress:clear_error", function (event, error) {
			$scope.progressData.clear_error = error;
		});

		// The total songs to write can be updated by duplicate removal.
		$scope.$on("progress:new_total_write_count", function (event, total_songs_to_write) {
			console.log("Old total write count: " + $scope.progressData.total_songs_to_write);
			console.log("New total write count: " + total_songs_to_write);
			$scope.progressData.total_songs_to_write = total_songs_to_write;
		});

		$scope.ok = function () {
			$modalInstance.close();
		};
	}];

	function getSomeTracksFromSources() {
		var songs = [];
		var songNum = 0;

		$scope.selectionData.sources.forEach(function (source) {
			for (var i = 0; i < source.total; ++i) {
				songs.push(songNum++);
			}
		});

		var chosen_songs = window.chance.pick(songs, $scope.selectionData.totalSongsInDestination);
		// Sort by integers
		chosen_songs.sort(function (a, b) { return a - b; });

		var total_chosen_songs = chosen_songs.length;
		var current_offset = 0;
		var i = 0;

		var promises = [];

		$scope.selectionData.sources.forEach(function (source) {
			var source_total = source.total;
			var source_songs = [];

			while (i < total_chosen_songs) {
				var current_song_pos_in_source = chosen_songs[i] - current_offset;

				// If the song we're currently looking at belongs to a different source, move on
				if (current_song_pos_in_source >= source_total) {
					break;
				}
				// Else, add it to the source_songs collection
				else {
					source_songs.push(current_song_pos_in_source);
					++i;
				}
			}

			current_offset += source_total;

			promises.push(DeezerPlaylist.getPlaylistTracks(source.id, source_songs).then(
					null,
					null,
					function (progress) {
						$scope.$broadcast("progress:tracks_read", progress.delta);
					}));
		});

		return promises;
	}

	function getAllTracksFromSources() {
		var promises = [];

		$scope.selectionData.sources.forEach(function (source) {
			promises.push(DeezerPlaylist.getPlaylistTracks(source.id).then(
					null,
					null,
					function (progress) {
						$scope.$broadcast("progress:tracks_read", progress.delta);
					}));
		});

		return promises;
	}

	$scope.showConfirmDialog = function() {
		var confirmDialog = $modal.open({
			templateUrl: "views/confirm.html",
			controller: confirmDialogCtrl,
			windowClass: "confirm-dialog",
			resolve: {
				selectionData: function () {
					return $scope.selectionData;
				}
			}
		});

		confirmDialog.result.then(function () {
			var progressDialog = $modal.open({
				templateUrl: "views/progress.html",
				controller: progressDialogCtrl,
				windowClass: "progress-dialog",
				backdrop: "static",
				keyboard: false,
				scope: $scope,
				resolve: {
					selectionData: function () {
						return $scope.selectionData;
					}
				}
			});

			var destination_contains_all =
					$scope.selectionData.totalSongsInSources == $scope.selectionData.totalSongsInDestination;
			var ensure_unique = $scope.selectionData.ensureUnique;
			var promises = null;
			if (destination_contains_all || ensure_unique) {
				promises = getAllTracksFromSources();
			} else {
				promises = getSomeTracksFromSources();
			}

			$q.all(promises).then(
					// Success
					function (result) {
						$scope.$broadcast("progress:finished_read");

						var track_uris = [];

						result.forEach(function (tracks) {
							track_uris = track_uris.concat(tracks);
						});

						// Filter strange results out
						track_uris = track_uris.filter(function (track) {
							return track != "spotify:track:null";
						});

						if (ensure_unique) {
							// Remove duplicates by sorting and deleting those elements
							// that are preceded by an element with the same value.
							// From: http://stackoverflow.com/a/9229821/441265
							track_uris = track_uris.sort().filter(function(item, pos) {
								return !pos || item != track_uris[pos - 1];
							});

							$scope.$broadcast("progress:new_total_write_count", track_uris.length);
						}

						// (Re)shuffle to introduce randomness
						if (track_uris.length > $scope.selectionData.totalSongsInDestination) {
							track_uris = window.chance.pick(track_uris, $scope.selectionData.totalSongsInDestination);
							$scope.$broadcast("progress:new_total_write_count", track_uris.length);
						} else {
							track_uris = window.chance.shuffle(track_uris);
						}

						console.log("SelectionData.destination");
						console.log($scope.selectionData.destination);
						DeezerPlaylist.clearPlaylist($scope.selectionData.destination.id).then(
							function (result) {
							console.log("#################");
							console.log(result);
								$scope.$broadcast("progress:finished_clear");
								DeezerPlaylist.addPlaylistTracks($scope.selectionData.destination.id, track_uris).then(
										// Success
										function (result) {
											$scope.$broadcast("progress:finished_write");
											console.log("Success");
										},
										function (error) {
											console.log("Write error: " + error);
											$scope.$broadcast("progress:write_error", error);
										},
										function (progress) {
											$scope.$broadcast("progress:tracks_written", progress.delta);
										}
								);
							},
							function (error) {
								console.log("Clear error: " + error);
								$scope.$broadcast("progress:clear_error", error);
							}
						);

					},
					// Error
					function (error) {
						console.log("Read error: " + error);
						$scope.$broadcast("progress:read_error", error);
					},
					function (progress) {
						// Apparently never called??
					}
			);
		});
	};
}]);
