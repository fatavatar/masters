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

app.get('/', function(request, response) {
  jsonData = readJsonFileSync('./json/teams.json');
  purse = readJsonFileSync('./json/purse.json');
var body = "";
  http.get({ host: 'www.pgatour.com', path: '/data/r/014/2017/leaderboard-v2.json' }, function(res) { 
  res.on('data', function(chunk) {
    body += chunk;
  });
  res.on('end', function() {
  leaderboard = JSON.parse(body);
  var players = {};
  for (var i = 0, len = leaderboard["leaderboard"]["players"].length; i < len; i++) {
        var jsonPlayer = leaderboard["leaderboard"]["players"][i];
	var player = {};
	player["name"] = jsonPlayer["player_bio"]["first_name"] + " " + jsonPlayer["player_bio"]["last_name"];
        player["position"] = jsonPlayer["current_position"];
        player["thru"] = jsonPlayer["thru"];
        player["total"] = jsonPlayer["total"];
        player["today"] = jsonPlayer["today"] === null ? "0" : jsonPlayer["today"];
	players[jsonPlayer["player_id"]] = player;
   }
	

  for(var i = 0, len = jsonData['teams'].length; i < len; i++) {
	var winnings = 0;
	response.write(jsonData['teams'][i]["Name"] + "\n");
	response.write("-----------------------------------\n");
        for (var j = 0, len2 = jsonData['teams'][i]['Players'].length; j < len2; j++) {
        var player = players[jsonData['teams'][i]['Players'][j]];
        var thru = player["thru"] === null ? "0" : player["thru"];
	var buffer = 20 - player["name"].length;
	response.write(player["name"]);
	for (var x = 0; x < buffer; x++) {
		response.write(" ");
	}
  	response.write(player["total"] + " (today: " + player["today"] + ")\t" + player["position"] + " thru " + thru + "\n");

	var position = player["position"];
	
	var rank = parseInt(position.replace('T', ''));
	if (rank <= 50) {
		winnings += purse["purse"][rank - 1];
	}
	}
	response.write("Current Winnings: " + winnings);
	response.write("\n");
	response.write("\n");
	}
response.send();
  });
  });
});

app.listen(app.get('port'), function() {
  console.log('Node app is running on port', app.get('port'));
});


