var express = require('express');
var fs = require('fs');
var path = require('path');
var app = express();
var http = require('http');
// var favicon = require('serve-favicon'):

// app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')))

function mkDirByPathSync(targetDir, isRelativeToScript) {
  const sep = path.sep;
  const initDir = path.isAbsolute(targetDir) ? sep : '';
  const baseDir = isRelativeToScript ? __dirname : '.';

  targetDir.split(sep).reduce((parentDir, childDir) => {
      const curDir = path.resolve(baseDir, parentDir, childDir);
      try {
            fs.mkdirSync(curDir);
            console.log(`Directory ${curDir} created!`);
          } catch (err) {
                if (err.code !== 'EEXIST') {
                        throw err;
                      }
          
                console.log(`Directory ${curDir} already exists!`);
              }
  
      return curDir;
    }, initDir);
}

function readJsonFileSync(filepath, encoding){

    if (typeof (encoding) == 'undefined'){
        encoding = 'utf8';
    }
    var file = fs.readFileSync(filepath, encoding);
    return JSON.parse(file);
}

function getLeaderFile(tourney) {
    var jsonDir = path.join(__dirname, "json");
    var directory = path.join(jsonDir, tourney);
    var tmpdir = path.join("/tmp", tourney );
    var leaderfile = path.join(directory, "leaderboard.json");
    var tmpLeaderFile = path.join(tmpdir, "leaderboard.json");
    if (fs.existsSync(leaderfile)) {
        console.log("Parsing Leaderfile!")
        return readJsonFileSync(leaderfile);
    }
    if (fs.existsSync(tmpLeaderFile)) {
        console.log("Parsing Tmp Leaderfile!")
        return readJsonFileSync(tmpLeaderFile);
    }
    return null;
}

function readTourneyData(tourney) {
    var jsonDir = path.join(__dirname, "json");
    var directory = path.join(jsonDir, tourney);
    var teamfile = path.join(directory, "teams.json");
    teams = readJsonFileSync(teamfile);
    var coursefile = path.join(directory, "course.json");
    course = readJsonFileSync(coursefile);
    var leaderfile = path.join(directory, "leaderboard.json");
    var courseInfo = {}

    course.leaderboard = getLeaderFile(directory)
    course.teams = teams.teams;
    return course;
}

function parseLeaderboardPga(leaderboard, players, playerList, ties) {
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
        playerList.push(player);
    }
}


function setupTeams(currentTourney, config, teams, players, ties) {

    console.log("Number of teams: " + currentTourney.teams.length);
    for(var i = 0, len = currentTourney.teams.length; i < len; i++) {
        var thisTeam = {};
        for (var j = 0, len2 = config.teams.length; j < len2; j++) {
            var configTeam = config.teams[j];
            if (configTeam.Name === currentTourney.teams[i].Name) {
                thisTeam.record = configTeam.Wins + "-" + configTeam.Loses + "-" + configTeam.Ties;
                thisTeam.winnings = configTeam.Winnings
            }
        }
        thisTeam.purse = 0;
        thisTeam.name = currentTourney.teams[i]["Name"];
        thisTeam.players = [];
        for (var j = 0, len2 = currentTourney.teams[i]['Players'].length; j < len2; j++) {
            var player = players[currentTourney.teams[i]['Players'][j]];
            console.log("Found Player " + player["name"]);
            thisTeam.players.push(player);
            var position = player["position"];
            var numTies = ties[player["position"]];

            var rank = parseInt(position.replace('T', ''));
            var player_purse = 0
                if (rank <= 60) {
                    for (var x = 0; x < numTies && (x + rank) < 60; x++) {

                        player_purse += config.purse[rank + x - 1];
                    }
                    thisTeam.purse += player_purse/ numTies
                }
        }
        thisTeam.purse = (thisTeam.purse/100.0) * currentTourney.purse;
        teams.push(thisTeam);
    }
    teams.sort(function(a,b) {
        if (a.purse < b.purse) {
            return 1;
        }
        if (a.purse > b.purse) {
            return -1;
        }
        return 0;
    });

}

function getConfig(req) {
    var tourneys = {}
    var jsondir = __dirname + "/json";
    config = readJsonFileSync(path.join(jsondir, "config.json"));
    purse = readJsonFileSync(path.join(jsondir, "purse.json"));
    config.purse = purse.purse;

    if (config.tournaments.indexOf(req.params.tourney) != -1) {
        currentTourneyName = req.params.tourney;
    }
    else {
        currentTourneyName = config.tournaments[0];
    }
    config.tournaments.forEach(function(tourney) {
        console.log("Reading tourney - " + tourney);
        tournament = readTourneyData(tourney);
        tournament.selected = false;
        tournament.id = tourney;

        tourneys[tourney] = tournament;
    });
    config.tourneyData = tourneys;
    config.currentTourney = config.tourneyData[currentTourneyName];
    config.currentTourney.selected = true;

    return config;
}

function archiveIfNeededPga(tourney, leaderboard) {
    var jsondir = "/tmp/json";
    var toPath = path.join(jsondir, tourney);
    if (!fs.existsSync(toPath)){
        mkDirByPathSync(toPath, false);
    }

    toPath = path.join(toPath, "leaderboard.json");
    if (leaderboard.state === "Official") {
        console.log("Saving leaderboard");
        var jsonString = JSON.stringify(leaderboard, null, 2);

        fs.writeFileSync(toPath, jsonString);
    }
}

function getLeaderboard(currentTourney, callback) {
    var players = {};
    var playerList = [];
    var ties = {};
    if (currentTourney.leaderboard == null) {
        console.log("Remote fetching Leaderboard - " + currentTourney.leaderboardURL);
        var body = "";
        http.get({ host: 'data.pga.com', path: currentTourney.leaderboardURL }, function(jres) {
            jres.on('data', function(chunk) {
                body += chunk;
                });
            jres.on('end', function() {
                // body = body.replace("callbackWrapper(", "");
                body = body.substring(16, body.length - 2);
                leaderboard = JSON.parse(body);
                // check for this being over.
                currentTourney.leaderboard = leaderboard;
                archiveIfNeededPga(currentTourney.id, leaderboard);
                parseLeaderboardPga(leaderboard, players, playerList, ties);
                callback(players, playerList, ties);
            });

        });
    }
    else {
        parseLeaderboardPga(currentTourney.leaderboard, players, playerList, ties);
        callback(players, playerList, ties);
    }
}


app.set('port', (process.env.PORT || 5000));

app.use(express.static(__dirname + '/public'));

// views is directory for all template files
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');

app.get('/leaderboard/:tourney?', function (req, res, next) {
    console.log("Obtaining Leaderboard")
    config = getConfig(req);
    config.page = 'leaderboard';
    currentTourney = config.currentTourney;
    console.log("Current tourney = " + currentTourney.id);
    getLeaderboard(currentTourney, function(players, playerList, ties) {
        res.render('pages/leaderboard', {
            players : playerList,
            config : config
        });
    });

});

getTourney = function(req, res, next) {
    console.log("Obtaining tourney")
    config = getConfig(req);
    config.page = 'teams';
    currentTourney = config.currentTourney;
    console.log("Current tourney = " + currentTourney.id);
    var teams = [];
    getLeaderboard(currentTourney, function(players, playerList, ties) {
        setupTeams(currentTourney, config, teams, players, ties);
        res.render('pages/index', {
            teams: teams ,
            config: config
        });
    });
}


app.get('tourney/:tourney?', getTourney);
app.get('/:tourney?', getTourney);

app.listen(app.get('port'), function() {
  console.log('Node app is running on port', app.get('port'));
});


