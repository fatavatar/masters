var express = require('express');
var fs = require('fs');
var path = require('path');
var app = express();
var http = require('http');

function readJsonFileSync(filepath, encoding){

    if (typeof (encoding) == 'undefined'){
        encoding = 'utf8';
    }
    var file = fs.readFileSync(filepath, encoding);
    return JSON.parse(file);
}

function parseJsonDirSync(directory) {
	var teamfile = path.join(directory, "teams.json");
	teams = readJsonFileSync(teamfile);
	var coursefile = path.join(directory, "course.json");
	course = readJsonFileSync(coursefile);
	var leaderfile = path.join(directory, "leaderboard.json");
	var courseInfo = {}
	
	if (fs.exists(leaderfile)) {
		leaderboard = readJsonFileSync(leaderfile);
		course.leaderboard = leaderboard;
	} else {
		course.leaderboard = null;
	}

	course.path = directory;
	course.teams = teams.teams;
	return course;
}

function parseLeaderboard(leaderboard, players, ties) {
	for (var i = 0, len = leaderboard["player"].length; i < len; i++) {
		var jsonPlayer = leaderboard["player"][i];
		var player = {};
		player["name"] = jsonPlayer["firstName"] + " " + jsonPlayer["lastName"];
		player["position"] = jsonPlayer["currentPosition"];
		player["thru"] = jsonPlayer["thru"].length <= 2 ? "thru " + jsonPlayer["thru"] : jsonPlayer["thru"];
		player["total"] = jsonPlayer["totalParRelative"];
		player["today"] = jsonPlayer["currentParRelative"] === "-" ? "0" : jsonPlayer["currentParRelative"];
		if (ties[player["position"]] === undefined) {
			ties[player["position"]] = 0;
		}
		ties[player["position"]]++;

		players[jsonPlayer["id"]] = player;
	}
}

function setupTeams(currentTourney, config, teams, players, ties) {

	console.log(currentTourney.teams.length);
	for(var i = 0, len = currentTourney.teams.length; i < len; i++) {
		var thisTeam = {};
		for (var j = 0, len2 = config.teams.length; j < len2; j++) {
			var configTeam = config.teams[j];
			if (configTeam.Name === currentTourney.teams[i].Name) {
				thisTeam.record = configTeam.Wins + "-" + configTeam.Loses;
				thisTeam.winnings = configTeam.Winnings
			}
		}
		thisTeam.purse = 0;
		thisTeam.name = currentTourney.teams[i]["Name"];
		thisTeam.players = [];
		for (var j = 0, len2 = currentTourney.teams[i]['Players'].length; j < len2; j++) {
			var player = players[currentTourney.teams[i]['Players'][j]];
			console.log("PID = " + currentTourney.teams[i]['Players'][j]);
			thisTeam.players.push(player);
			var position = player["position"];
			var numTies = ties[player["position"]];

			var rank = parseInt(position.replace('T', ''));
			var player_purse = 0
				if (rank <= 60) {
					for (var x = 0; x < numTies && (x + rank) < 60; x++) {

						player_purse += purse["purse"][rank + x - 1];
						console.log(player["name"] + ": " + player_purse);
					}
					thisTeam.purse += player_purse/ numTies
				}
		}
		thisTeam.purse = (thisTeam.purse/100.0) * currentTourney.purse;
		teams.push(thisTeam);
	}
}


app.set('port', (process.env.PORT || 5000));

app.use(express.static(__dirname + '/public'));

// views is directory for all template files
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');

app.get('/', function(req, res, next) {
	var tourneys = []; 
	var jsondir = __dirname + "/json";
	config = readJsonFileSync(path.join(jsondir, "config.json"));
	purse = readJsonFileSync(path.join(jsondir, "purse.json"));
	
	currentTourneyName = config.tournaments[0];
	var fromPath = path.join(jsondir, currentTourneyName);
	currentTourney = parseJsonDirSync(fromPath);
	
/*
	config.tournaments.forEach( function(file, index) {
		var fromPath = path.join(jsondir, file);
		stat = fs.statSync(fromPath);
		if (stat.isDirectory()) {
			tourneyData = parseJsonDirSync(fromPath);
			tourneys.push(tourneyData);
		}
	});
*/
	// console.log(JSON.stringify(tourneys));

	var players = {};
	var ties = {};
	var teams = []; 
	if (currentTourney.leaderboard == null) {
		var body = "";
		http.get({ host: 'data.pga.com', path: currentTourney.leaderboardURL }, function(jres) { 
			jres.on('data', function(chunk) {
				body += chunk;
				});
			jres.on('end', function() {
				// body = body.replace("callbackWrapper(", "");
				body = body.substring(16, body.length - 2);
				leaderboard = JSON.parse(body);
				parseLeaderboard(leaderboard, players, ties);
				setupTeams(currentTourney, config, teams, players, ties);
				res.render('pages/index', { 
					teams: teams 
				});
			});

		});
	}
	else {
		parseLeaderboard(currentTourney.leaderboard, players, ties);
		setupTeams(currentTourney, config, teams, players, ties);
		res.render('pages/index', { 
			teams: teams,
			config: config
		});
	}

});


app.listen(app.get('port'), function() {
  console.log('Node app is running on port', app.get('port'));
});


