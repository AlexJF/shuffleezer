'use strict';

var shuffleezerApp = angular.module('shuffleezerApp', [
	'ngSanitize',
	'oauth',
	'ngRoute',
	'deezerServices',
	'ui.select',
	'ui.bootstrap',
	'truncate',
]);

shuffleezerApp.config(["$routeProvider", "$locationProvider", "uiSelectConfig", function ($routeProvider, $locationProvider, uiSelectConfig) {
	$routeProvider
			.when('/', {
				templateUrl: 'views/main.html',
				controller: 'MainCtrl'
			})
			.otherwise({
				redirectTo: '/'
			});
	$locationProvider.html5Mode(true).hashPrefix('!');
	uiSelectConfig.theme = 'bootstrap';
}]);
