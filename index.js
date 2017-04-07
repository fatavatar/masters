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
  http.get({ host: 'data.pga.com', path: '/jsonp/event/R014/2017/leaderboard.json' }, function(res) { 
  res.on('data', function(chunk) {
    body += chunk;
  });
  res.on('end', function() {
  // body = body.replace("callbackWrapper(", "");
console.log(body.length);
  body = body.substring(16, body.length - 2);
console.log(body.length);
  leaderboard = JSON.parse(body);
  var players = {};
  for (var i = 0, len = leaderboard["player"].length; i < len; i++) {
        var jsonPlayer = leaderboard["player"][i];
	var player = {};
	player["name"] = jsonPlayer["firstName"] + " " + jsonPlayer["lastName"];
        player["position"] = jsonPlayer["currentPosition"];
        player["thru"] = jsonPlayer["thru"].length <= 2 ? "thru " + jsonPlayer["thru"] : jsonPlayer["thru"];
        player["total"] = jsonPlayer["totalParRelative"];
        player["today"] = jsonPlayer["currentParRelative"] === "-" ? "0" : jsonPlayer["currentParRelative"];
	players[jsonPlayer["id"]] = player;
   }
	

  for(var i = 0, len = jsonData['teams'].length; i < len; i++) {
	var winnings = 0;
	response.write(jsonData['teams'][i]["Name"] + "\n");
	response.write("-----------------------------------\n");
        for (var j = 0, len2 = jsonData['teams'][i]['Players'].length; j < len2; j++) {
        var player = players[jsonData['teams'][i]['Players'][j]];
        var thru = player["thru"] === null ? "0" : player["thru"];
	var buffer = 17 - player["name"].length;
	response.write(player["name"]);
	for (var x = 0; x < buffer; x++) {
		response.write(" ");
	}
  	response.write(player["total"] + " (" + player["today"] + ") \t" + player["position"] + " " + thru + "\n");

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


