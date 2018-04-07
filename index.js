var express = require('express');
var fs = require('fs');
var path = require('path');
var app = express();
var http = require('http');
var moment = require('moment');
// var favicon = require('serve-favicon'):

function getDirectories(path) {
  return fs.readdirSync(path).filter(function (file) {
      return fs.statSync(path+'/'+file).isDirectory();
    });
}

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
    jsonDir = path.join(jsonDir, "tourneys");
    var directory = path.join(jsonDir, tourney);
    var tmpdir = path.join("/tmp", "json");
    tmpdir = path.join(tmpdir, tourney);
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

function readTourneyData(tourney, year) {
    try {
        var jsonDir = path.join(__dirname, "json");
        jsonDir = path.join(jsonDir, "tourneys");
        tourneyDir = path.join(year, tourney);
        var directory = path.join(jsonDir, tourneyDir);
        var teamfile = path.join(directory, "teams.json");
        teams = readJsonFileSync(teamfile);
        var coursefile = path.join(directory, "course.json");
        course = readJsonFileSync(coursefile);
        var leaderfile = path.join(directory, "leaderboard.json");
        var courseInfo = {}

        course.leaderboard = getLeaderFile(tourneyDir)
        course.teams = teams.teams;
        return course;
    } catch (err) {
        console.log(err);
        return null;
    }
}

function parseLeaderboardPga(tourney) {
    leaderboard = tourney.leaderboard;
    tourney.playerList = [];
    tourney.ties = {};
    tourney.players = {};

    for (var i = 0, len = leaderboard["player"].length; i < len; i++) {
        var jsonPlayer = leaderboard["player"][i];
        var player = {};
        player["name"] = jsonPlayer["firstName"] + " " + jsonPlayer["lastName"];
        player["position"] = jsonPlayer["currentPosition"];
        player["thru"] = jsonPlayer["thru"].length <= 2 ? "thru " + jsonPlayer["thru"] : jsonPlayer["thru"];
        player["total"] = jsonPlayer["totalParRelative"];
        player["today"] = jsonPlayer["currentParRelative"] === "-" ? "0" : jsonPlayer["currentParRelative"];
        if (tourney.ties[player["position"]] === undefined) {
            tourney.ties[player["position"]] = 0;
        }
        tourney.ties[player["position"]]++;

        tourney.players[jsonPlayer["id"]] = player;
        tourney.playerList.push(player);
    }
}


function setupTeams(currentTourney, config) {

    players = currentTourney.players;
    ties = currentTourney.ties;
    currentTourney.standings = [];
    console.log("Number of teams: " + currentTourney.teams.length);
    for(var i = 0, len = currentTourney.teams.length; i < len; i++) {
        var thisTeam = {};
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
        currentTourney.standings.push(thisTeam);
    }

    currentTourney.standings.sort(function(a,b) {
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
    var tourneys = [];
    var jsondir = __dirname + "/json";
    config = {}
    purse = readJsonFileSync(path.join(jsondir, "purse.json"));
    config.purse = purse.purse;
    config.currentTourney = null;
    currentTourneyName = null;

    if ("tourney" in req.params) {
        currentTourneyName = req.params.tourney + "_" + req.params.year;
    }

    getDirectories(__dirname + "/json/tourneys").forEach(function(year) {
        getDirectories(__dirname + "/json/tourneys/" + year).forEach(function(tourney) {
            console.log("Reading tourney - " + tourney + " " + year);
            tournament = readTourneyData(tourney, year);
            if (tournament != null) {
                tournament.selected = false;
                id = tourney + "_" + year;
                tournament.tid = tourney;
                tournament.year = year;

                tourneys.push(tournament);
                if (currentTourneyName === id) {
                    config.currentTourney = tournament;
                    config.currentTourney.selected = true;
                }
            }
        });
    });
    config.tourneyData = tourneys;

    return config;
}

function isOver(leaderboard) {

    if (leaderboard.state === "Official") {
        endDate = moment(leaderboard.endDate, "MM/DD/YYYY");
        if (endDate.isAfter(moment.now())) {
            return true;
        }
    }
    return false;
}

function archiveIfNeededPga(tourney, year, leaderboard) {
    var jsondir = "/tmp/json";
    var toPath = path.join(jsondir, year);
    var toPath = path.join(toPath, tourney);
    if (!fs.existsSync(toPath)){
        mkDirByPathSync(toPath, false);
    }

    toPath = path.join(toPath, "leaderboard.json");
    if (isOver(leaderboard)) {
        console.log("Saving leaderboard");
        var jsonString = JSON.stringify(leaderboard, null, 2);
        fs.writeFileSync(toPath, jsonString);
    }
}

function getLeaderboard(currentTourney, callback) {
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
                archiveIfNeededPga(currentTourney.tid, currentTourney.year, leaderboard);
                parseLeaderboardPga(currentTourney);
                callback(currentTourney);
            });

        });
    }
    else {
        parseLeaderboardPga(currentTourney);
        callback(currentTourney);
    }
}

updateRecords = function(tourney, config) {
    if (!(tourney.year in config.records)) {
        config.records[tourney.year] = {};
    }
    records = config.records[tourney.year];
    tourney.standings.forEach(function(team) {
        if (!( team.name in records)) {
            records[team.name] = {}
            teamRecord = records[team.name];
            teamRecord.wins = 0;
            teamRecord.losses = 0;
            teamRecord.ties = 0;
            teamRecord.name = team.name;
            teamRecord.winnings = 0;
        }
    });
    if (isOver(tourney.leaderboard)) {
        purse = tourney.standings[0].purse;
        winners = 0;
        tourney.standings.forEach(function(team) {
            if (purse == team.purse) {
                winners++;
            }
        });

        tourney.standings.forEach(function(team) {
            teamRecord = records[team.name];
            if (team.purse == purse) {
                if (winners > 1) {
                    teamRecord.ties++;
                } else {
                    teamRecord.wins++;
                }
                teamRecord.winnings += 20 * (tourney.standings.length - winners) / winners;
            } else {
                teamRecord.losses++;
                teamRecord.winnings -= 20;
            }
        });
    }
}


app.set('port', (process.env.PORT || 5000));

app.use(express.static(__dirname + '/public'));

// views is directory for all template files
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');

app.get('/leaderboard/:year?/:tourney?', function (req, res, next) {
    console.log("Obtaining Leaderboard")
    getTourney("leaderboard", req, res, next);
});

app.get('/:year?/:tourney?', function(req, res, next) {
    console.log("Obtaining tourney")
    getTourney("teams", req, res, next);
});
app.get('/tourney/:year?/:tourney?', function(req, res, next) {
    console.log("Obtaining tourney")
    getTourney("teams", req, res, next);
});

app.listen(app.get('port'), function() {
  console.log('Node app is running on port', app.get('port'));
});


getTourney = function(page, req, res, next) {
    config = getConfig(req);
    config.page = page;
    config.records = {};

    count = config.tourneyData.length;
    config.tourneyData.forEach(function(tourney) {
        getLeaderboard(tourney, function(theTourney) {
            setupTeams(theTourney, config);
            updateRecords(theTourney, config);
            count--;
            console.log("Count = " + count);
            if (count == 0) {

                config.tourneyData.sort(function(a,b) {
                    startA = moment(a.leaderboard.startDate, "MM/DD/YYYY");
                    startB = moment(b.leaderboard.startDate, "MM/DD/YYYY");
                    if (startA.isBefore(startB)) {
                        return 1;
                    }
                    if (startA.isAfter(startB)) {
                        return -1;
                    }
                    return 0;
                });

                if (config.currentTourney == null) {
                    config.currentTourney = config.tourneyData[0];
                }

                if (page === "teams") {
                    res.render('pages/index', {
                        teams: config.currentTourney.standings,
                        config: config
                    });
                } else if (page === "leaderboard") {
                    res.render('pages/leaderboard', {
                        players : config.currentTourney.playerList,
                        config : config
                    });
                }
            }
        });
    });
}


