// Sakina Study Guide — weekly homework.
// Add a new block to the top of this list for each new homework sheet.
// Mission types: spelling, colsub, predict, compass, discuss.
// "skills" lists the maths from that week. Earlier weeks' skills come back
// in every later homework as a "Remember these!" mission.
// Sheets marked done: true were completed on paper. They get no missions,
// but their spellings and maths keep coming back for review.

window.HOMEWORK = [
  {
    id: "hw-2026-11-16",
    due: "2026-11-16",
    title: "Character descriptions",
    skills: ["coladd"],
    missions: [
      {
        id: "spell", type: "spelling", emoji: "✏️", colour: "teal",
        title: "Spelling: sound-alike words",
        sub: "Homophones: look, write, check, then a test",
        tip: "These are homophones: they sound the same but are spelt differently and mean different things. Listen to the sentence to choose the right one!",
        words: [
          ["here", "Come over here, please."],
          ["hear", "I can hear the birds singing."],
          ["heel", "I have a blister on my heel."],
          ["heal", "The cut on my knee will heal soon."],
          ["main", "We walked along the main road."],
          ["mane", "The lion shook its fluffy mane."],
          ["mail", "The postman brought the mail."],
          ["male", "The male duck has a shiny green head."],
          ["knot", "Tie a knot in your shoelace."],
          ["not", "I am not tired yet."]
        ],
        pairs: [["here", "hear"], ["heel", "heal"], ["main", "mane"], ["mail", "male"], ["knot", "not"]],
        hints: { here: "a place", hear: "you hear with your ear!", heel: "the back of your foot", heal: "get better", main: "the most important or biggest", mane: "hair on a lion or horse", mail: "letters and parcels", male: "a boy animal or man", knot: "a twist in string or rope (the k is silent!)", not: "the opposite of yes" },
        paper: "Now write each word 10 times in your homework book, then ask a grown-up to test you."
      },
      {
        id: "add", type: "coladd", emoji: "➕", colour: "sky",
        title: "Maths: column addition",
        sub: "8 sums with carrying",
        sums: [[347, 26], [582, 41], [217, 73], [435, 58], [781, 24], [358, 67], [694, 36], [537, 82]],
        paper: "Copy each sum into your book in columns. Show the numbers you carry."
      },
      {
        id: "describe", type: "describe", emoji: "🦸", colour: "coral",
        title: "English: describe a character",
        sub: "Noun phrases, similes and time adverbials",
        example: [["Yesterday,", "time"], [" the brave, curly-haired boy", "noun"], [" crept through the dark forest ", ""], ["like a sneaky fox", "simile"], [".", ""]],
        builder: {
          time: ["Yesterday,", "One sunny morning,", "Last night,", "After school,", "Suddenly,", "At midnight,"],
          adj: ["brave", "kind", "tiny", "clever", "curly-haired", "sparkly-eyed", "cheeky", "gentle", "grumpy", "fearless"],
          action: ["crept through the dark forest", "skipped across the playground", "tiptoed down the creaky stairs", "zoomed around the park", "danced in the rain", "climbed the tallest tree"],
          simile: ["like a sneaky fox", "as fast as a cheetah", "like a bouncing bunny", "as quiet as a mouse", "like a roaring lion", "as light as a feather"]
        },
        paper: "Write your paragraph in your book in your neatest handwriting. Check capital letters, commas and full stops!"
      },
      {
        id: "rocks", type: "rocks", emoji: "🪨", colour: "plum",
        title: "Science: rock hunt",
        sub: "Find things made of rock at home",
        paper: "Copy your rock list into your book. Challenge: write the type of each rock too."
      },
      {
        id: "rights", type: "rights", emoji: "🌍", colour: "sun",
        title: "World Children's Day",
        sub: "Ask 3 people about children's rights",
        day: "Friday 20 November",
        paper: "Write down each person's answer in your book: who they are, which right, and why."
      }
    ]
  },
  {
    id: "hw-2026-11-09",
    due: "2026-11-09",
    title: "Iron Man week",
    skills: ["colsub"],
    missions: [
      {
        id: "spell", type: "spelling", emoji: "✏️", colour: "teal",
        title: "Spelling: 'ear' words",
        mark: "ear",
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
  },
  {
    id: "hw-2026-11-02",
    due: "2026-11-02",
    title: "Rocks and similes",
    done: true,
    skills: ["moreless"],
    spelling: {
      tip: "ai makes the 'ay' sound in the middle of a word: brain, afraid. In straight it's spelt aigh!",
      words: [
        ["straight", "Draw a straight line with a ruler."],
        ["campaign", "Our class ran a campaign to save the trees."],
        ["contain", "These boxes contain old toys."],
        ["brain", "Your brain helps you think."],
        ["faint", "I heard a faint knock at the door."],
        ["waist", "She tied a belt around her waist."],
        ["claim", "I claim the last biscuit!"],
        ["praise", "Our teacher gave us praise for good work."],
        ["complaint", "Dad made a complaint about the cold food."],
        ["afraid", "The kitten was afraid of the dog."]
      ]
    }
  },
  {
    id: "hw-2026-10-26",
    due: "2026-10-26",
    title: "Milo Imagines the World",
    done: true,
    skills: ["bonds10"],
    spelling: {
      tip: "ey can make the long 'ay' sound at the end of a word: they, grey, obey.",
      words: [
        ["hey", "Hey, wait for me!"],
        ["they", "They went to the park."],
        ["obey", "Dogs can learn to obey."],
        ["grey", "The sky was grey and cloudy."],
        ["prey", "The owl hunted its prey at night."],
        ["whey", "Little Miss Muffet ate her curds and whey."],
        ["purvey", "The bakery will purvey fresh bread to the cafe."],
        ["convey", "Pictures can convey how we feel."],
        ["disobey", "Don't disobey the lollipop lady."],
        ["survey", "We did a survey of our favourite fruits."]
      ]
    }
  }
];
