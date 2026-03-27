window.__LOC_DATA__ = {
  "FriendshipPavilion": {
    "displayName": "友谊之亭",
    "image": "友谊之亭.jpg",
    "connectedTo": ["YoungSwallowsSoar", "DonutGarden"],
    "directionTo": {
      "YoungSwallowsSoar": "N",
      "DonutGarden": "E"
    },
    "offset": {
      "dx": -21,
      "dy": -113
    }
  },
  "DinosaurCorner": {
    "displayName": "恐龙角",
    "image": "恐龙角.jpg",
    "connectedTo": ["YoungSwallowsSoar", "ArtSpace", "FootballPark"],
    "directionTo": {
      "YoungSwallowsSoar": "W",
      "ArtSpace": "N",
      "FootballPark": "S"
    },
    "offset": {
      "dx": 7,
      "dy": -45
    }
  },
  "DonutGarden": {
    "displayName": "甜甜圈花园",
    "image": "甜甜圈花园.jpg",
    "connectedTo": ["FootballPark", "FriendshipPavilion"],
    "directionTo": {
      "FootballPark": "N",
      "FriendshipPavilion": "W"
    },
    "offset": {
      "dx": -4,
      "dy": -122
    }
  },
  "ArtSpace": {
    "displayName": "艺趣空间",
    "image": "艺趣空间.jpg",
    "connectedTo": ["YoungSwallowsSoar", "DinosaurCorner"],
    "directionTo": {
      "YoungSwallowsSoar": "S",
      "DinosaurCorner": "S"
    },
    "offset": {
      "dx": 8,
      "dy": -62
    }
  },
  "FootballPark": {
    "displayName": "足球乐园",
    "image": "足球乐园.jpg",
    "connectedTo": ["DinosaurCorner", "DonutGarden"],
    "directionTo": {
      "DinosaurCorner": "N",
      "DonutGarden": "S"
    },
    "offset": {
      "dx": 7,
      "dy": -86
    }
  },
  "YoungSwallowsSoar": {
    "displayName": "雏燕奋飞",
    "image": "雏燕奋飞.jpg",
    "connectedTo": ["DinosaurCorner", "ArtSpace", "FriendshipPavilion"],
    "directionTo": {
      "DinosaurCorner": "E",
      "ArtSpace": "N",
      "FriendshipPavilion": "S"
    },
    "offset": {
      "dx": -15,
      "dy": -39
    }
  }
};
