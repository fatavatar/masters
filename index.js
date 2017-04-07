var express = require('express');
var fs = require('fs');
var app = express();
var http = require('http');

function readJsonFileSync(filepath, encoding){

    if (typeof (encoding) == 'undefined'){
        encoding = 'utf8';
    }
    var file = fs.readFileSync(filepath, encoding);
    return JSON.parse(file);
}

app.set('port', (process.env.PORT || 5000));

app.use(express.static(__dirname + '/public'));

// views is directory for all template files
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');

app.get('/', function(req, res, next) {
	jsonData = readJsonFileSync('./json/teams.json');
	purse = readJsonFileSync('./json/purse.json');
	var body = "";
	http.get({ host: 'data.pga.com', path: '/jsonp/event/R014/2017/leaderboard.json' }, function(jres) { 
		jres.on('data', function(chunk) {
			body += chunk;
			});
		jres.on('end', function() {
			// body = body.replace("callbackWrapper(", "");
			console.log(body.length);
			body = body.substring(16, body.length - 2);
			console.log(body.length);
			leaderboard = JSON.parse(body);
			var players = {};
			var ties = {};
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

			var teams = []; 
			for(var i = 0, len = jsonData['teams'].length; i < len; i++) {
				var thisTeam = {};
				thisTeam.winnings = 0;
				thisTeam.name = jsonData['teams'][i]["Name"];
				thisTeam.players = [];
				for (var j = 0, len2 = jsonData['teams'][i]['Players'].length; j < len2; j++) {
					var player = players[jsonData['teams'][i]['Players'][j]];
					thisTeam.players.push(player);
					var position = player["position"];
					var numTies = ties[player["position"]];
	

					var rank = parseInt(position.replace('T', ''));
					var player_winnings = 0
						if (rank <= 50) {
							for (var x = 0; x < numTies && (x + rank) < 50; x++) {

								player_winnings += purse["purse"][rank + x - 1];
								console.log(player["name"] + ": " + player_winnings);
							}
							thisTeam.winnings += player_winnings/ numTies
						}
				}
				teams.push(thisTeam);
			}
			res.render('pages/index', { 
				teams: teams 
			});
		});
	});


});


app.listen(app.get('port'), function() {
  console.log('Node app is running on port', app.get('port'));
});


