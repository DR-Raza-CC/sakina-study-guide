// Sakina Study Guide — weekly homework.
// Add a new block to the top of this list for each new homework sheet.
// Mission types: spelling, colsub, predict, compass, discuss.

window.HOMEWORK = [
  {
    id: "hw-2026-11-09",
    due: "2026-11-09",
    title: "Iron Man week",
    missions: [
      {
        id: "spell", type: "spelling", emoji: "✏️", colour: "teal",
        title: "Spelling: 'ear' words",
        sub: "Look, write, check. Then a grown-up test!",
        tip: "In these words, 'ear' says 'er', like in her. Listen: earth, learn, search.",
        words: [
          ["earth", "We live on planet earth."],
          ["early", "I woke up early this morning."],
          ["learn", "I want to learn to swim."],
          ["heard", "I heard a bird singing."],
          ["earn", "You can earn stars by working hard."],
          ["pearl", "The pearl was white and shiny."],
          ["search", "We had to search for the missing sock."],
          ["unearth", "The dog tried to unearth a bone in the garden."],
          ["earl", "The earl lived in a big castle."],
          ["rehearse", "We rehearse our class play every day."]
        ],
        paper: "Now write each word 10 times in your homework book, then ask a grown-up to test you."
      },
      {
        id: "sub", type: "colsub", emoji: "🧮", colour: "sky",
        title: "Maths: column subtraction",
        sub: "8 sums with exchanging",
        sums: [[263, 145], [576, 247], [734, 326], [481, 252], [314, 122], [639, 242], [302, 154], [750, 352]],
        paper: "Copy each sum into your book in columns. Show your exchanges by crossing out and writing the new number."
      },
      {
        id: "predict", type: "predict", emoji: "🤖", colour: "coral",
        title: "English: The Iron Man",
        sub: "Be a prediction detective",
        book: "The Iron Man", author: "Ted Hughes",
        clues: [
          { word: "IRON", emoji: "🔩", text: "Iron is a hard, heavy, strong metal. Gates, pans and nails can be made of iron." },
          { word: "MAN", emoji: "🧍", text: "A man is a grown-up person. So the Iron Man might look a bit like a person..." }
        ],
        sentences: [
          { start: "I think the Iron Man is", ideas: ["a giant robot", "a man made of metal", "a knight in shiny armour", "a big metal monster", "a friendly machine"] },
          { start: "I think he lives", ideas: ["on top of a cliff", "in a scrapyard full of old metal", "deep under the sea", "in a dark cave", "on a faraway planet"] },
          { start: "I think the story will be about", ideas: ["the Iron Man making a friend", "people who are scared of him", "a big battle", "him saving the world", "a child who helps him"] }
        ],
        paper: "Copy your 3 sentences into your book. Remember capital letters and full stops!"
      },
      {
        id: "compass", type: "compass", emoji: "🧭", colour: "plum",
        title: "Geography: compass map",
        sub: "North, south, east and west",
        // places on the map that count for each direction in the map hunt
        accept: {
          N: ["Inverness", "Aberdeen", "Glasgow", "Edinburgh", "North Sea"],
          NE: ["Aberdeen", "Edinburgh", "North Sea", "Middlesbrough"],
          E: ["North Sea", "Ipswich", "Middlesbrough", "York"],
          SE: ["London", "Dover", "Ipswich"],
          S: ["Exeter", "Southampton", "English Channel", "Bristol", "Oxford", "London", "Dover", "Cardiff"],
          SW: ["Exeter", "Cardiff", "Bristol"],
          W: ["Belfast", "Liverpool", "Cardiff"],
          NW: ["Inverness", "Glasgow", "Belfast"]
        },
        paper: "Write your answers on the lines in your book."
      },
      {
        id: "friend", type: "discuss", emoji: "💛", colour: "sun",
        title: "Talk time: good friends",
        sub: "What makes a good friend?",
        warmup: [
          ["Sharing your crayons", true],
          ["Leaving someone out of a game", false],
          ["Saying sorry when you get it wrong", true],
          ["Laughing when a friend falls over", false],
          ["Listening when a friend talks", true],
          ["Telling a friend's secret to everyone", false]
        ],
        questions: [
          { q: "What qualities does a good friend have?", ideas: ["Kind", "Honest", "Good at sharing", "Funny", "Sticks by you"] },
          { q: "How can you show kindness to your friends?", ideas: ["Share your things", "Say something nice", "Help when they are stuck", "Ask them to play"] },
          { q: "What should you do if you have a disagreement with a friend?", ideas: ["Take a deep breath", "Listen to their side", "Find a fair way", "Say sorry", "Ask a grown-up for help"] },
          { q: "Why is it important to listen to your friends?", ideas: ["So they feel cared about", "To understand how they feel", "Because you like being listened to"] },
          { q: "How can you help a friend who is feeling sad or worried?", ideas: ["Ask if they are okay", "Sit with them", "Give a hug if they want one", "Tell a grown-up"] }
        ]
      }
    ]
  }
];
