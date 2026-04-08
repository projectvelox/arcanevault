import { useState, useEffect, useCallback, useMemo, useRef } from "react";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// EMBEDDED MTG CARD DATABASE (~100 iconic cards)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const CARDS_DB = [
  // ── WHITE ──
  {id:"w1",name:"Swords to Plowshares",mana_cost:"{W}",cmc:1,type_line:"Instant",oracle_text:"Exile target creature. Its controller gains life equal to its power.",colors:["W"],color_identity:["W"],set_name:"Iconic Masters",set:"ima",rarity:"uncommon",power:null,toughness:null,prices:{usd:"1.79",usd_foil:"5.99",eur:"1.50"},legalities:{standard:"not_legal",modern:"not_legal",legacy:"legal",commander:"legal",pauper:"not_legal"},keywords:["Exile"],image_uris:{small:"https://cards.scryfall.io/small/front/7/d/7d839f21-68c7-47db-a55a-2c3f15803571.jpg?1690996488",normal:"https://cards.scryfall.io/normal/front/7/d/7d839f21-68c7-47db-a55a-2c3f15803571.jpg?1690996488"}},
  {id:"w2",name:"Path to Exile",mana_cost:"{W}",cmc:1,type_line:"Instant",oracle_text:"Exile target creature. Its controller may search their library for a basic land card, put that card onto the battlefield tapped, then shuffle.",colors:["W"],color_identity:["W"],set_name:"Double Masters",set:"2xm",rarity:"uncommon",power:null,toughness:null,prices:{usd:"2.49",usd_foil:"4.99",eur:"2.20"},legalities:{standard:"not_legal",modern:"legal",legacy:"legal",commander:"legal",pauper:"not_legal"},keywords:["Exile"],image_uris:{small:"https://cards.scryfall.io/small/front/e/9/e9d36855-c38a-4bba-a642-cff3f25f1571.jpg?1599709071",normal:"https://cards.scryfall.io/normal/front/e/9/e9d36855-c38a-4bba-a642-cff3f25f1571.jpg?1599709071"}},
  {id:"w3",name:"Wrath of God",mana_cost:"{2}{W}{W}",cmc:4,type_line:"Sorcery",oracle_text:"Destroy all creatures. They can't be regenerated.",colors:["W"],color_identity:["W"],set_name:"Double Masters",set:"2xm",rarity:"rare",power:null,toughness:null,prices:{usd:"3.49",usd_foil:"7.99",eur:"3.00"},legalities:{standard:"not_legal",modern:"legal",legacy:"legal",commander:"legal",pauper:"not_legal"},keywords:[],image_uris:{small:"https://cards.scryfall.io/small/front/6/6/664e6571-2571-4764-a26b-0265142b8979.jpg?1598913494",normal:"https://cards.scryfall.io/normal/front/6/6/664e6571-2571-4764-a26b-0265142b8979.jpg?1598913494"}},
  {id:"w4",name:"Sun Titan",mana_cost:"{4}{W}{W}",cmc:6,type_line:"Creature — Giant",oracle_text:"Vigilance\nWhenever Sun Titan enters the battlefield or attacks, you may return target permanent card with mana value 3 or less from your graveyard to the battlefield.",colors:["W"],color_identity:["W"],set_name:"Commander 2021",set:"c21",rarity:"mythic",power:"6",toughness:"6",prices:{usd:"1.29",usd_foil:"3.49",eur:"1.10"},legalities:{standard:"not_legal",modern:"legal",legacy:"legal",commander:"legal",pauper:"not_legal"},keywords:["Vigilance"],image_uris:{small:"https://cards.scryfall.io/small/front/d/5/d5529c38-3571-40a0-84a4-8e84e0e724e5.jpg?1625975519",normal:"https://cards.scryfall.io/normal/front/d/5/d5529c38-3571-40a0-84a4-8e84e0e724e5.jpg?1625975519"}},
  {id:"w5",name:"Mother of Runes",mana_cost:"{W}",cmc:1,type_line:"Creature — Human Cleric",oracle_text:"{T}: Target creature you control gains protection from the color of your choice until end of turn.",colors:["W"],color_identity:["W"],set_name:"Commander Masters",set:"cmm",rarity:"uncommon",power:"1",toughness:"1",prices:{usd:"2.99",usd_foil:"6.49",eur:"2.50"},legalities:{standard:"not_legal",modern:"not_legal",legacy:"legal",commander:"legal",pauper:"not_legal"},keywords:["Protection"],image_uris:{small:"https://cards.scryfall.io/small/front/1/a/1a368b3e-1d1a-44bd-8226-9e820e581750.jpg?1690998589",normal:"https://cards.scryfall.io/normal/front/1/a/1a368b3e-1d1a-44bd-8226-9e820e581750.jpg?1690998589"}},
  {id:"w6",name:"Serra Angel",mana_cost:"{3}{W}{W}",cmc:5,type_line:"Creature — Angel",oracle_text:"Flying, vigilance",colors:["W"],color_identity:["W"],set_name:"Dominaria",set:"dom",rarity:"uncommon",power:"4",toughness:"4",prices:{usd:"0.25",usd_foil:"1.49",eur:"0.20"},legalities:{standard:"not_legal",modern:"legal",legacy:"legal",commander:"legal",pauper:"not_legal"},keywords:["Flying","Vigilance"],image_uris:{small:"https://cards.scryfall.io/small/front/9/0/9067f035-3437-4c5c-bae9-d3c9571cbc69.jpg?1562737400",normal:"https://cards.scryfall.io/normal/front/9/0/9067f035-3437-4c5c-bae9-d3c9571cbc69.jpg?1562737400"}},
  // ── BLUE ──
  {id:"u1",name:"Counterspell",mana_cost:"{U}{U}",cmc:2,type_line:"Instant",oracle_text:"Counter target spell.",colors:["U"],color_identity:["U"],set_name:"Modern Horizons 2",set:"mh2",rarity:"uncommon",power:null,toughness:null,prices:{usd:"1.49",usd_foil:"3.99",eur:"1.30"},legalities:{standard:"not_legal",modern:"legal",legacy:"legal",commander:"legal",pauper:"legal"},keywords:[],image_uris:{small:"https://cards.scryfall.io/small/front/1/9/1920dae4-fb92-4f19-ae4b-eb3276b8dac7.jpg?1628801663",normal:"https://cards.scryfall.io/normal/front/1/9/1920dae4-fb92-4f19-ae4b-eb3276b8dac7.jpg?1628801663"}},
  {id:"u2",name:"Brainstorm",mana_cost:"{U}",cmc:1,type_line:"Instant",oracle_text:"Draw three cards, then put two cards from your hand on top of your library in any order.",colors:["U"],color_identity:["U"],set_name:"Commander Masters",set:"cmm",rarity:"common",power:null,toughness:null,prices:{usd:"0.99",usd_foil:"2.49",eur:"0.80"},legalities:{standard:"not_legal",modern:"not_legal",legacy:"legal",commander:"legal",pauper:"legal"},keywords:[],image_uris:{small:"https://cards.scryfall.io/small/front/b/5/b5ef365f-4039-4faf-b76c-6b3535244d40.jpg?1690998731",normal:"https://cards.scryfall.io/normal/front/b/5/b5ef365f-4039-4faf-b76c-6b3535244d40.jpg?1690998731"}},
  {id:"u3",name:"Cyclonic Rift",mana_cost:"{1}{U}",cmc:2,type_line:"Instant",oracle_text:"Return target nonland permanent you don't control to its owner's hand.\nOverload {6}{U}",colors:["U"],color_identity:["U"],set_name:"Modern Masters 2017",set:"mm3",rarity:"rare",power:null,toughness:null,prices:{usd:"24.99",usd_foil:"39.99",eur:"22.00"},legalities:{standard:"not_legal",modern:"not_legal",legacy:"legal",commander:"legal",pauper:"not_legal"},keywords:["Overload"],image_uris:{small:"https://cards.scryfall.io/small/front/f/f/ff08e5ed-f47b-4d8e-8b8b-41675dccef8b.jpg?1561768489",normal:"https://cards.scryfall.io/normal/front/f/f/ff08e5ed-f47b-4d8e-8b8b-41675dccef8b.jpg?1561768489"}},
  {id:"u4",name:"Snapcaster Mage",mana_cost:"{1}{U}",cmc:2,type_line:"Creature — Human Wizard",oracle_text:"Flash\nWhen Snapcaster Mage enters the battlefield, target instant or sorcery card in your graveyard gains flashback until end of turn.",colors:["U"],color_identity:["U"],set_name:"Ultimate Masters",set:"uma",rarity:"mythic",power:"2",toughness:"1",prices:{usd:"19.99",usd_foil:"44.99",eur:"18.00"},legalities:{standard:"not_legal",modern:"legal",legacy:"legal",commander:"legal",pauper:"not_legal"},keywords:["Flash","Flashback"],image_uris:{small:"https://cards.scryfall.io/small/front/7/e/7e41765e-43fe-461d-baeb-ee30d13d2d93.jpg?1547516526",normal:"https://cards.scryfall.io/normal/front/7/e/7e41765e-43fe-461d-baeb-ee30d13d2d93.jpg?1547516526"}},
  {id:"u5",name:"Mulldrifter",mana_cost:"{4}{U}",cmc:5,type_line:"Creature — Elemental",oracle_text:"Flying\nWhen Mulldrifter enters the battlefield, draw two cards.\nEvoke {2}{U}",colors:["U"],color_identity:["U"],set_name:"Commander Masters",set:"cmm",rarity:"common",power:"2",toughness:"2",prices:{usd:"0.25",usd_foil:"1.99",eur:"0.20"},legalities:{standard:"not_legal",modern:"legal",legacy:"legal",commander:"legal",pauper:"legal"},keywords:["Flying","Evoke"],image_uris:{small:"https://cards.scryfall.io/small/front/0/3/03c68899-30c4-4cfa-a673-6752a0a47f32.jpg?1690999001",normal:"https://cards.scryfall.io/normal/front/0/3/03c68899-30c4-4cfa-a673-6752a0a47f32.jpg?1690999001"}},
  {id:"u6",name:"Mystic Remora",mana_cost:"{U}",cmc:1,type_line:"Enchantment",oracle_text:"Cumulative upkeep {1}\nWhenever an opponent casts a noncreature spell, you may draw a card unless that player pays {4}.",colors:["U"],color_identity:["U"],set_name:"Ice Age",set:"ice",rarity:"common",power:null,toughness:null,prices:{usd:"4.99",usd_foil:null,eur:"4.50"},legalities:{standard:"not_legal",modern:"not_legal",legacy:"legal",commander:"legal",pauper:"legal"},keywords:[],image_uris:{small:"https://cards.scryfall.io/small/front/1/3/13a08c07-e8b8-43bf-99e6-d268c79a62bf.jpg?1559592432",normal:"https://cards.scryfall.io/normal/front/1/3/13a08c07-e8b8-43bf-99e6-d268c79a62bf.jpg?1559592432"}},
  // ── BLACK ──
  {id:"b1",name:"Dark Ritual",mana_cost:"{B}",cmc:1,type_line:"Instant",oracle_text:"Add {B}{B}{B}.",colors:["B"],color_identity:["B"],set_name:"Masters 25",set:"a25",rarity:"common",power:null,toughness:null,prices:{usd:"0.79",usd_foil:"2.99",eur:"0.60"},legalities:{standard:"not_legal",modern:"not_legal",legacy:"legal",commander:"legal",pauper:"not_legal"},keywords:[],image_uris:{small:"https://cards.scryfall.io/small/front/9/5/95f27eeb-6f14-4db3-adb9-9be5ed76b34b.jpg?1628801678",normal:"https://cards.scryfall.io/normal/front/9/5/95f27eeb-6f14-4db3-adb9-9be5ed76b34b.jpg?1628801678"}},
  {id:"b2",name:"Demonic Tutor",mana_cost:"{1}{B}",cmc:2,type_line:"Sorcery",oracle_text:"Search your library for a card, put that card into your hand, then shuffle.",colors:["B"],color_identity:["B"],set_name:"Ultimate Masters",set:"uma",rarity:"rare",power:null,toughness:null,prices:{usd:"34.99",usd_foil:"69.99",eur:"32.00"},legalities:{standard:"not_legal",modern:"not_legal",legacy:"legal",commander:"legal",pauper:"not_legal"},keywords:[],image_uris:{small:"https://cards.scryfall.io/small/front/3/b/3bdbc231-5316-4abd-9d8d-d87cff2c9847.jpg?1547516843",normal:"https://cards.scryfall.io/normal/front/3/b/3bdbc231-5316-4abd-9d8d-d87cff2c9847.jpg?1547516843"}},
  {id:"b3",name:"Toxic Deluge",mana_cost:"{2}{B}",cmc:3,type_line:"Sorcery",oracle_text:"As an additional cost to cast this spell, pay X life.\nAll creatures get -X/-X until end of turn.",colors:["B"],color_identity:["B"],set_name:"Commander Masters",set:"cmm",rarity:"rare",power:null,toughness:null,prices:{usd:"12.99",usd_foil:"19.99",eur:"11.00"},legalities:{standard:"not_legal",modern:"not_legal",legacy:"legal",commander:"legal",pauper:"not_legal"},keywords:[],image_uris:{small:"https://cards.scryfall.io/small/front/d/0/d00e8b85-2d0c-4e70-9e0c-3d02a351ab1d.jpg?1690999224",normal:"https://cards.scryfall.io/normal/front/d/0/d00e8b85-2d0c-4e70-9e0c-3d02a351ab1d.jpg?1690999224"}},
  {id:"b4",name:"Sheoldred, the Apocalypse",mana_cost:"{2}{B}{B}",cmc:4,type_line:"Legendary Creature — Phyrexian Praetor",oracle_text:"Deathtouch\nWhenever you draw a card, you gain 2 life.\nWhenever an opponent draws a card, they lose 2 life.",colors:["B"],color_identity:["B"],set_name:"Dominaria United",set:"dmu",rarity:"mythic",power:"4",toughness:"5",prices:{usd:"54.99",usd_foil:"79.99",eur:"50.00"},legalities:{standard:"legal",modern:"legal",legacy:"legal",commander:"legal",pauper:"not_legal"},keywords:["Deathtouch"],image_uris:{small:"https://cards.scryfall.io/small/front/d/6/d67be074-cdd4-41d9-ac89-0a0456c4e4b2.jpg?1674057568",normal:"https://cards.scryfall.io/normal/front/d/6/d67be074-cdd4-41d9-ac89-0a0456c4e4b2.jpg?1674057568"}},
  {id:"b5",name:"Grave Titan",mana_cost:"{4}{B}{B}",cmc:6,type_line:"Creature — Giant",oracle_text:"Deathtouch\nWhenever Grave Titan enters the battlefield or attacks, create two 2/2 black Zombie creature tokens.",colors:["B"],color_identity:["B"],set_name:"Commander 2021",set:"c21",rarity:"mythic",power:"6",toughness:"6",prices:{usd:"5.49",usd_foil:"12.99",eur:"4.80"},legalities:{standard:"not_legal",modern:"legal",legacy:"legal",commander:"legal",pauper:"not_legal"},keywords:["Deathtouch"],image_uris:{small:"https://cards.scryfall.io/small/front/6/8/68ce4c64-9f82-4be1-aa3b-c8c585b25f25.jpg?1625976907",normal:"https://cards.scryfall.io/normal/front/6/8/68ce4c64-9f82-4be1-aa3b-c8c585b25f25.jpg?1625976907"}},
  // ── RED ──
  {id:"r1",name:"Lightning Bolt",mana_cost:"{R}",cmc:1,type_line:"Instant",oracle_text:"Lightning Bolt deals 3 damage to any target.",colors:["R"],color_identity:["R"],set_name:"Masters 25",set:"a25",rarity:"uncommon",power:null,toughness:null,prices:{usd:"1.49",usd_foil:"4.99",eur:"1.20"},legalities:{standard:"not_legal",modern:"legal",legacy:"legal",commander:"legal",pauper:"legal"},keywords:[],image_uris:{small:"https://cards.scryfall.io/small/front/e/3/e3285e6b-3e79-4d7c-bf96-d920f973b122.jpg?1562442158",normal:"https://cards.scryfall.io/normal/front/e/3/e3285e6b-3e79-4d7c-bf96-d920f973b122.jpg?1562442158"}},
  {id:"r2",name:"Goblin Guide",mana_cost:"{R}",cmc:1,type_line:"Creature — Goblin Scout",oracle_text:"Haste\nWhenever Goblin Guide attacks, defending player reveals the top card of their library. If it's a land card, that player puts it into their hand.",colors:["R"],color_identity:["R"],set_name:"Modern Masters 2017",set:"mm3",rarity:"rare",power:"2",toughness:"2",prices:{usd:"4.99",usd_foil:"14.99",eur:"4.50"},legalities:{standard:"not_legal",modern:"legal",legacy:"legal",commander:"legal",pauper:"not_legal"},keywords:["Haste"],image_uris:{small:"https://cards.scryfall.io/small/front/5/5/552b7314-5dd9-4722-841b-2e4571cb4c3a.jpg?1593813154",normal:"https://cards.scryfall.io/normal/front/5/5/552b7314-5dd9-4722-841b-2e4571cb4c3a.jpg?1593813154"}},
  {id:"r3",name:"Chaos Warp",mana_cost:"{2}{R}",cmc:3,type_line:"Instant",oracle_text:"The owner of target permanent shuffles it into their library, then reveals the top card of their library. If it's a permanent card, they put it onto the battlefield.",colors:["R"],color_identity:["R"],set_name:"Commander Masters",set:"cmm",rarity:"rare",power:null,toughness:null,prices:{usd:"2.99",usd_foil:"5.99",eur:"2.50"},legalities:{standard:"not_legal",modern:"not_legal",legacy:"legal",commander:"legal",pauper:"not_legal"},keywords:[],image_uris:{small:"https://cards.scryfall.io/small/front/0/c/0c20d8d5-a54a-4d29-948c-c9c6f6a7f8af.jpg?1690999372",normal:"https://cards.scryfall.io/normal/front/0/c/0c20d8d5-a54a-4d29-948c-c9c6f6a7f8af.jpg?1690999372"}},
  {id:"r4",name:"Dockside Extortionist",mana_cost:"{1}{R}",cmc:2,type_line:"Creature — Goblin Pirate",oracle_text:"When Dockside Extortionist enters the battlefield, create X Treasure tokens, where X is the number of artifacts and enchantments your opponents control.",colors:["R"],color_identity:["R"],set_name:"Commander 2019",set:"c19",rarity:"rare",power:"1",toughness:"2",prices:{usd:"49.99",usd_foil:null,eur:"45.00"},legalities:{standard:"not_legal",modern:"not_legal",legacy:"legal",commander:"banned",pauper:"not_legal"},keywords:[],image_uris:{small:"https://cards.scryfall.io/small/front/5/7/571bc9eb-8d13-4008-86b5-2e348a326d58.jpg?1615499802",normal:"https://cards.scryfall.io/normal/front/5/7/571bc9eb-8d13-4008-86b5-2e348a326d58.jpg?1615499802"}},
  {id:"r5",name:"Inferno Titan",mana_cost:"{4}{R}{R}",cmc:6,type_line:"Creature — Giant",oracle_text:"{R}: Inferno Titan gets +1/+0 until end of turn.\nWhenever Inferno Titan enters the battlefield or attacks, it deals 3 damage divided as you choose among one, two, or three targets.",colors:["R"],color_identity:["R"],set_name:"Commander 2015",set:"c15",rarity:"mythic",power:"6",toughness:"6",prices:{usd:"1.49",usd_foil:null,eur:"1.20"},legalities:{standard:"not_legal",modern:"legal",legacy:"legal",commander:"legal",pauper:"not_legal"},keywords:[],image_uris:{small:"https://cards.scryfall.io/small/front/1/1/116eafca-668b-4864-bb7a-98c1c9e8b5a2.jpg?1562259846",normal:"https://cards.scryfall.io/normal/front/1/1/116eafca-668b-4864-bb7a-98c1c9e8b5a2.jpg?1562259846"}},
  // ── GREEN ──
  {id:"g1",name:"Llanowar Elves",mana_cost:"{G}",cmc:1,type_line:"Creature — Elf Druid",oracle_text:"{T}: Add {G}.",colors:["G"],color_identity:["G"],set_name:"Dominaria",set:"dom",rarity:"common",power:"1",toughness:"1",prices:{usd:"0.25",usd_foil:"1.49",eur:"0.20"},legalities:{standard:"not_legal",modern:"legal",legacy:"legal",commander:"legal",pauper:"legal"},keywords:[],image_uris:{small:"https://cards.scryfall.io/small/front/7/3/73542493-cd0b-4bb7-a5b8-8f889c76e4d6.jpg?1562302708",normal:"https://cards.scryfall.io/normal/front/7/3/73542493-cd0b-4bb7-a5b8-8f889c76e4d6.jpg?1562302708"}},
  {id:"g2",name:"Birds of Paradise",mana_cost:"{G}",cmc:1,type_line:"Creature — Bird",oracle_text:"Flying\n{T}: Add one mana of any color.",colors:["G"],color_identity:["G"],set_name:"Ravnica Allegiance Guild Kit",set:"gk2",rarity:"rare",power:"0",toughness:"1",prices:{usd:"7.99",usd_foil:null,eur:"7.00"},legalities:{standard:"not_legal",modern:"legal",legacy:"legal",commander:"legal",pauper:"not_legal"},keywords:["Flying"],image_uris:{small:"https://cards.scryfall.io/small/front/f/e/feefe9f0-24a6-461c-9ef1-86c5a6f33b83.jpg?1576382162",normal:"https://cards.scryfall.io/normal/front/f/e/feefe9f0-24a6-461c-9ef1-86c5a6f33b83.jpg?1576382162"}},
  {id:"g3",name:"Beast Within",mana_cost:"{2}{G}",cmc:3,type_line:"Instant",oracle_text:"Destroy target permanent. Its controller creates a 3/3 green Beast creature token.",colors:["G"],color_identity:["G"],set_name:"Commander Masters",set:"cmm",rarity:"uncommon",power:null,toughness:null,prices:{usd:"0.79",usd_foil:"2.49",eur:"0.60"},legalities:{standard:"not_legal",modern:"legal",legacy:"legal",commander:"legal",pauper:"not_legal"},keywords:[],image_uris:{small:"https://cards.scryfall.io/small/front/1/e/1eb5c493-12cb-4c2e-9e60-a1e4c75f844d.jpg?1690999540",normal:"https://cards.scryfall.io/normal/front/1/e/1eb5c493-12cb-4c2e-9e60-a1e4c75f844d.jpg?1690999540"}},
  {id:"g4",name:"Craterhoof Behemoth",mana_cost:"{5}{G}{G}{G}",cmc:8,type_line:"Creature — Beast",oracle_text:"Haste\nWhen Craterhoof Behemoth enters the battlefield, creatures you control gain trample and get +X/+X until end of turn, where X is the number of creatures you control.",colors:["G"],color_identity:["G"],set_name:"Jumpstart",set:"jmp",rarity:"mythic",power:"5",toughness:"5",prices:{usd:"29.99",usd_foil:null,eur:"27.00"},legalities:{standard:"not_legal",modern:"legal",legacy:"legal",commander:"legal",pauper:"not_legal"},keywords:["Haste","Trample"],image_uris:{small:"https://cards.scryfall.io/small/front/4/4/44afd414-cc69-4888-ba12-7ea87e60b1f7.jpg?1601079153",normal:"https://cards.scryfall.io/normal/front/4/4/44afd414-cc69-4888-ba12-7ea87e60b1f7.jpg?1601079153"}},
  {id:"g5",name:"Cultivate",mana_cost:"{2}{G}",cmc:3,type_line:"Sorcery",oracle_text:"Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle.",colors:["G"],color_identity:["G"],set_name:"Commander Masters",set:"cmm",rarity:"common",power:null,toughness:null,prices:{usd:"0.35",usd_foil:"1.29",eur:"0.30"},legalities:{standard:"not_legal",modern:"legal",legacy:"legal",commander:"legal",pauper:"not_legal"},keywords:[],image_uris:{small:"https://cards.scryfall.io/small/front/f/5/f5368c9b-0c08-4264-83d5-bbe40c8f3e73.jpg?1690999589",normal:"https://cards.scryfall.io/normal/front/f/5/f5368c9b-0c08-4264-83d5-bbe40c8f3e73.jpg?1690999589"}},
  {id:"g6",name:"Eternal Witness",mana_cost:"{1}{G}{G}",cmc:3,type_line:"Creature — Human Shaman",oracle_text:"When Eternal Witness enters the battlefield, you may return target card from your graveyard to your hand.",colors:["G"],color_identity:["G"],set_name:"Commander Masters",set:"cmm",rarity:"uncommon",power:"2",toughness:"1",prices:{usd:"0.49",usd_foil:"1.99",eur:"0.40"},legalities:{standard:"not_legal",modern:"legal",legacy:"legal",commander:"legal",pauper:"not_legal"},keywords:[],image_uris:{small:"https://cards.scryfall.io/small/front/7/e/7e42e438-01a7-4425-b1dc-3b0f71447e5e.jpg?1690999609",normal:"https://cards.scryfall.io/normal/front/7/e/7e42e438-01a7-4425-b1dc-3b0f71447e5e.jpg?1690999609"}},
  // ── MULTICOLOR ──
  {id:"m1",name:"Teferi, Hero of Dominaria",mana_cost:"{3}{W}{U}",cmc:5,type_line:"Legendary Planeswalker — Teferi",oracle_text:"+1: Draw a card. At the beginning of the next end step, untap up to two lands.\n−3: Put target nonland permanent into its owner's library third from the top.\n−8: You get an emblem with \"Whenever you draw a card, exile target permanent an opponent controls.\"",colors:["W","U"],color_identity:["W","U"],set_name:"Dominaria",set:"dom",rarity:"mythic",power:null,toughness:null,prices:{usd:"14.99",usd_foil:"24.99",eur:"13.00"},legalities:{standard:"not_legal",modern:"legal",legacy:"legal",commander:"legal",pauper:"not_legal"},keywords:[],image_uris:{small:"https://cards.scryfall.io/small/front/5/d/5d10b752-d9cb-419d-a5c4-d4ee1acb603f.jpg?1562736365",normal:"https://cards.scryfall.io/normal/front/5/d/5d10b752-d9cb-419d-a5c4-d4ee1acb603f.jpg?1562736365"}},
  {id:"m2",name:"Atraxa, Praetors' Voice",mana_cost:"{G}{W}{U}{B}",cmc:4,type_line:"Legendary Creature — Phyrexian Angel Horror",oracle_text:"Flying, vigilance, deathtouch, lifelink\nAt the beginning of your end step, proliferate.",colors:["W","U","B","G"],color_identity:["W","U","B","G"],set_name:"Commander Masters",set:"cmm",rarity:"mythic",power:"4",toughness:"4",prices:{usd:"9.99",usd_foil:"19.99",eur:"9.00"},legalities:{standard:"not_legal",modern:"not_legal",legacy:"legal",commander:"legal",pauper:"not_legal"},keywords:["Flying","Vigilance","Deathtouch","Lifelink","Proliferate"],image_uris:{small:"https://cards.scryfall.io/small/front/d/0/d0d33d52-3d28-4635-b985-51e126289259.jpg?1690999770",normal:"https://cards.scryfall.io/normal/front/d/0/d0d33d52-3d28-4635-b985-51e126289259.jpg?1690999770"}},
  {id:"m3",name:"Korvold, Fae-Cursed King",mana_cost:"{2}{B}{R}{G}",cmc:5,type_line:"Legendary Creature — Dragon Noble",oracle_text:"Flying\nWhenever Korvold, Fae-Cursed King enters the battlefield or attacks, sacrifice another permanent.\nWhenever you sacrifice a permanent, put a +1/+1 counter on Korvold and draw a card.",colors:["B","R","G"],color_identity:["B","R","G"],set_name:"Throne of Eldraine",set:"eld",rarity:"mythic",power:"4",toughness:"4",prices:{usd:"7.99",usd_foil:"14.99",eur:"7.00"},legalities:{standard:"not_legal",modern:"not_legal",legacy:"legal",commander:"legal",pauper:"not_legal"},keywords:["Flying"],image_uris:{small:"https://cards.scryfall.io/small/front/9/2/92ea1575-eb64-43b5-b604-c6e23054f228.jpg?1571197150",normal:"https://cards.scryfall.io/normal/front/9/2/92ea1575-eb64-43b5-b604-c6e23054f228.jpg?1571197150"}},
  // ── COLORLESS / ARTIFACTS ──
  {id:"c1",name:"Sol Ring",mana_cost:"{1}",cmc:1,type_line:"Artifact",oracle_text:"{T}: Add {C}{C}.",colors:[],color_identity:[],set_name:"Commander Masters",set:"cmm",rarity:"uncommon",power:null,toughness:null,prices:{usd:"1.99",usd_foil:"4.99",eur:"1.70"},legalities:{standard:"not_legal",modern:"not_legal",legacy:"legal",commander:"legal",pauper:"not_legal"},keywords:[],image_uris:{small:"https://cards.scryfall.io/small/front/b/9/b9e40312-05e8-46a4-825e-04480be5781c.jpg?1691000269",normal:"https://cards.scryfall.io/normal/front/b/9/b9e40312-05e8-46a4-825e-04480be5781c.jpg?1691000269"}},
  {id:"c2",name:"Arcane Signet",mana_cost:"{2}",cmc:2,type_line:"Artifact",oracle_text:"{T}: Add one mana of any color in your commander's color identity.",colors:[],color_identity:[],set_name:"Commander Masters",set:"cmm",rarity:"common",power:null,toughness:null,prices:{usd:"0.99",usd_foil:"2.49",eur:"0.80"},legalities:{standard:"not_legal",modern:"not_legal",legacy:"legal",commander:"legal",pauper:"not_legal"},keywords:[],image_uris:{small:"https://cards.scryfall.io/small/front/5/b/5b245a5b-5a99-4d22-99ef-3f5bf49c3262.jpg?1691000204",normal:"https://cards.scryfall.io/normal/front/5/b/5b245a5b-5a99-4d22-99ef-3f5bf49c3262.jpg?1691000204"}},
  {id:"c3",name:"Lightning Greaves",mana_cost:"{2}",cmc:2,type_line:"Artifact — Equipment",oracle_text:"Equipped creature has haste and shroud.\nEquip {0}",colors:[],color_identity:[],set_name:"Commander Masters",set:"cmm",rarity:"uncommon",power:null,toughness:null,prices:{usd:"2.49",usd_foil:"5.99",eur:"2.20"},legalities:{standard:"not_legal",modern:"legal",legacy:"legal",commander:"legal",pauper:"not_legal"},keywords:["Equip","Haste","Shroud"],image_uris:{small:"https://cards.scryfall.io/small/front/8/d/8d9f47af-5857-49c4-8d53-532e7e2b2be6.jpg?1691000288",normal:"https://cards.scryfall.io/normal/front/8/d/8d9f47af-5857-49c4-8d53-532e7e2b2be6.jpg?1691000288"}},
  {id:"c4",name:"Swiftfoot Boots",mana_cost:"{2}",cmc:2,type_line:"Artifact — Equipment",oracle_text:"Equipped creature has hexproof and haste.\nEquip {1}",colors:[],color_identity:[],set_name:"Commander Masters",set:"cmm",rarity:"uncommon",power:null,toughness:null,prices:{usd:"1.49",usd_foil:"3.49",eur:"1.20"},legalities:{standard:"not_legal",modern:"legal",legacy:"legal",commander:"legal",pauper:"not_legal"},keywords:["Equip","Hexproof","Haste"],image_uris:{small:"https://cards.scryfall.io/small/front/9/c/9c316917-1569-4840-83da-701ab86aad12.jpg?1691000306",normal:"https://cards.scryfall.io/normal/front/9/c/9c316917-1569-4840-83da-701ab86aad12.jpg?1691000306"}},
  {id:"c5",name:"Solemn Simulacrum",mana_cost:"{4}",cmc:4,type_line:"Artifact Creature — Golem",oracle_text:"When Solemn Simulacrum enters the battlefield, you may search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.\nWhen Solemn Simulacrum dies, you may draw a card.",colors:[],color_identity:[],set_name:"Commander Masters",set:"cmm",rarity:"rare",power:"2",toughness:"2",prices:{usd:"0.79",usd_foil:"2.49",eur:"0.60"},legalities:{standard:"not_legal",modern:"legal",legacy:"legal",commander:"legal",pauper:"not_legal"},keywords:[],image_uris:{small:"https://cards.scryfall.io/small/front/3/a/3a60f238-5735-49e5-9a72-86096273e5e0.jpg?1691000313",normal:"https://cards.scryfall.io/normal/front/3/a/3a60f238-5735-49e5-9a72-86096273e5e0.jpg?1691000313"}},
  // ── LANDS ──
  {id:"l1",name:"Command Tower",mana_cost:"",cmc:0,type_line:"Land",oracle_text:"{T}: Add one mana of any color in your commander's color identity.",colors:[],color_identity:[],set_name:"Commander Masters",set:"cmm",rarity:"common",power:null,toughness:null,prices:{usd:"0.25",usd_foil:"1.49",eur:"0.20"},legalities:{standard:"not_legal",modern:"not_legal",legacy:"legal",commander:"legal",pauper:"not_legal"},keywords:[],image_uris:{small:"https://cards.scryfall.io/small/front/7/7/77a679dd-220c-4fbe-bf1e-8a30e3b2eac6.jpg?1691000361",normal:"https://cards.scryfall.io/normal/front/7/7/77a679dd-220c-4fbe-bf1e-8a30e3b2eac6.jpg?1691000361"}},
  {id:"l2",name:"Reliquary Tower",mana_cost:"",cmc:0,type_line:"Land",oracle_text:"You have no maximum hand size.\n{T}: Add {C}.",colors:[],color_identity:[],set_name:"Commander Masters",set:"cmm",rarity:"uncommon",power:null,toughness:null,prices:{usd:"0.49",usd_foil:"1.99",eur:"0.40"},legalities:{standard:"not_legal",modern:"legal",legacy:"legal",commander:"legal",pauper:"not_legal"},keywords:[],image_uris:{small:"https://cards.scryfall.io/small/front/a/c/ac0cdbe9-35d1-4456-a1f6-336e9fae8740.jpg?1691000383",normal:"https://cards.scryfall.io/normal/front/a/c/ac0cdbe9-35d1-4456-a1f6-336e9fae8740.jpg?1691000383"}},
  // ── MORE STAPLES ──
  {id:"x1",name:"Thought Vessel",mana_cost:"{2}",cmc:2,type_line:"Artifact",oracle_text:"You have no maximum hand size.\n{T}: Add {C}.",colors:[],color_identity:[],set_name:"Commander Masters",set:"cmm",rarity:"common",power:null,toughness:null,prices:{usd:"0.99",usd_foil:"2.49",eur:"0.80"},legalities:{standard:"not_legal",modern:"not_legal",legacy:"legal",commander:"legal",pauper:"not_legal"},keywords:[],image_uris:{small:"https://cards.scryfall.io/small/front/2/1/210f3ae4-2f8e-4f71-8fea-1f22c52e811f.jpg?1691000331",normal:"https://cards.scryfall.io/normal/front/2/1/210f3ae4-2f8e-4f71-8fea-1f22c52e811f.jpg?1691000331"}},
  {id:"x2",name:"Rhystic Study",mana_cost:"{2}{U}",cmc:3,type_line:"Enchantment",oracle_text:"Whenever an opponent casts a spell, you may draw a card unless that player pays {1}.",colors:["U"],color_identity:["U"],set_name:"Jumpstart 2022",set:"j22",rarity:"rare",power:null,toughness:null,prices:{usd:"7.99",usd_foil:"14.99",eur:"7.00"},legalities:{standard:"not_legal",modern:"not_legal",legacy:"legal",commander:"legal",pauper:"legal"},keywords:[],image_uris:{small:"https://cards.scryfall.io/small/front/d/6/d6914dba-0d27-4055-ac34-b3571c8c13e2.jpg?1660724394",normal:"https://cards.scryfall.io/normal/front/d/6/d6914dba-0d27-4055-ac34-b3571c8c13e2.jpg?1660724394"}},
  {id:"x3",name:"Smothering Tithe",mana_cost:"{3}{W}",cmc:4,type_line:"Enchantment",oracle_text:"Whenever an opponent draws a card, that player may pay {2}. If the player doesn't, you create a Treasure token.",colors:["W"],color_identity:["W"],set_name:"Ravnica Allegiance",set:"rna",rarity:"rare",power:null,toughness:null,prices:{usd:"19.99",usd_foil:"34.99",eur:"18.00"},legalities:{standard:"not_legal",modern:"not_legal",legacy:"legal",commander:"legal",pauper:"not_legal"},keywords:[],image_uris:{small:"https://cards.scryfall.io/small/front/f/2/f25a4bbe-2af0-4d4a-95d4-d52c5937c747.jpg?1674196174",normal:"https://cards.scryfall.io/normal/front/f/2/f25a4bbe-2af0-4d4a-95d4-d52c5937c747.jpg?1674196174"}},
  {id:"x4",name:"Fierce Guardianship",mana_cost:"{2}{U}",cmc:3,type_line:"Instant",oracle_text:"If you control a commander, you may cast this spell without paying its mana cost.\nCounter target noncreature spell.",colors:["U"],color_identity:["U"],set_name:"Commander 2020",set:"c20",rarity:"rare",power:null,toughness:null,prices:{usd:"34.99",usd_foil:null,eur:"32.00"},legalities:{standard:"not_legal",modern:"not_legal",legacy:"legal",commander:"legal",pauper:"not_legal"},keywords:[],image_uris:{small:"https://cards.scryfall.io/small/front/4/c/4c5ffa83-c88d-4f5d-851e-a642b229d596.jpg?1591319453",normal:"https://cards.scryfall.io/normal/front/4/c/4c5ffa83-c88d-4f5d-851e-a642b229d596.jpg?1591319453"}},
  {id:"x5",name:"Sensei's Divining Top",mana_cost:"{1}",cmc:1,type_line:"Artifact",oracle_text:"{1}: Look at the top three cards of your library, then put them back in any order.\n{T}: Draw a card, then put Sensei's Divining Top on top of its owner's library.",colors:[],color_identity:[],set_name:"Eternal Masters",set:"ema",rarity:"rare",power:null,toughness:null,prices:{usd:"19.99",usd_foil:"49.99",eur:"18.00"},legalities:{standard:"not_legal",modern:"not_legal",legacy:"banned",commander:"legal",pauper:"not_legal"},keywords:[],image_uris:{small:"https://cards.scryfall.io/small/front/8/3/83c01c91-ea01-46c7-b94c-97777b968459.jpg?1580015272",normal:"https://cards.scryfall.io/normal/front/8/3/83c01c91-ea01-46c7-b94c-97777b968459.jpg?1580015272"}},
  {id:"x6",name:"Esper Sentinel",mana_cost:"{W}",cmc:1,type_line:"Artifact Creature — Human Soldier",oracle_text:"Whenever an opponent casts their first noncreature spell each turn, you draw a card unless that player pays {X}, where X is Esper Sentinel's power.",colors:["W"],color_identity:["W"],set_name:"Modern Horizons 2",set:"mh2",rarity:"rare",power:"1",toughness:"1",prices:{usd:"7.49",usd_foil:"14.99",eur:"6.50"},legalities:{standard:"not_legal",modern:"legal",legacy:"legal",commander:"legal",pauper:"not_legal"},keywords:[],image_uris:{small:"https://cards.scryfall.io/small/front/f/3/f3537373-ef54-4578-9d05-6216571f558a.jpg?1626093502",normal:"https://cards.scryfall.io/normal/front/f/3/f3537373-ef54-4578-9d05-6216571f558a.jpg?1626093502"}},
  {id:"x7",name:"Syr Konrad, the Grim",mana_cost:"{3}{B}{B}",cmc:5,type_line:"Legendary Creature — Human Knight",oracle_text:"Whenever another creature dies, or a creature card is put into a graveyard from anywhere other than the battlefield, or a creature card leaves your graveyard, Syr Konrad deals 1 damage to each opponent.\n{1}{B}: Each player mills a card.",colors:["B"],color_identity:["B"],set_name:"Throne of Eldraine",set:"eld",rarity:"uncommon",power:"5",toughness:"4",prices:{usd:"0.49",usd_foil:"2.49",eur:"0.40"},legalities:{standard:"not_legal",modern:"legal",legacy:"legal",commander:"legal",pauper:"legal"},keywords:["Mill"],image_uris:{small:"https://cards.scryfall.io/small/front/6/8/685faa53-c0b3-4dbb-abd9-bf09067f6f91.jpg?1604193606",normal:"https://cards.scryfall.io/normal/front/6/8/685faa53-c0b3-4dbb-abd9-bf09067f6f91.jpg?1604193606"}},
  {id:"x8",name:"Sakura-Tribe Elder",mana_cost:"{1}{G}",cmc:2,type_line:"Creature — Snake Shaman",oracle_text:"Sacrifice Sakura-Tribe Elder: Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.",colors:["G"],color_identity:["G"],set_name:"Commander Masters",set:"cmm",rarity:"common",power:"1",toughness:"1",prices:{usd:"0.25",usd_foil:"0.99",eur:"0.20"},legalities:{standard:"not_legal",modern:"legal",legacy:"legal",commander:"legal",pauper:"legal"},keywords:[],image_uris:{small:"https://cards.scryfall.io/small/front/c/8/c83be2b7-0373-4389-9aa0-523db58f4d2a.jpg?1591321004",normal:"https://cards.scryfall.io/normal/front/c/8/c83be2b7-0373-4389-9aa0-523db58f4d2a.jpg?1591321004"}},
  {id:"x9",name:"Kodama's Reach",mana_cost:"{2}{G}",cmc:3,type_line:"Sorcery — Arcane",oracle_text:"Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle.",colors:["G"],color_identity:["G"],set_name:"Commander Masters",set:"cmm",rarity:"common",power:null,toughness:null,prices:{usd:"0.35",usd_foil:"1.29",eur:"0.30"},legalities:{standard:"not_legal",modern:"legal",legacy:"legal",commander:"legal",pauper:"legal"},keywords:[],image_uris:{small:"https://cards.scryfall.io/small/front/9/7/979741db-e720-4efd-bc8e-2bf47e777ab3.jpg?1625194545",normal:"https://cards.scryfall.io/normal/front/9/7/979741db-e720-4efd-bc8e-2bf47e777ab3.jpg?1625194545"}},
  {id:"x10",name:"Blasphemous Act",mana_cost:"{8}{R}",cmc:9,type_line:"Sorcery",oracle_text:"This spell costs {1} less to cast for each creature on the battlefield.\nBlasphemous Act deals 13 damage to each creature.",colors:["R"],color_identity:["R"],set_name:"Commander Masters",set:"cmm",rarity:"rare",power:null,toughness:null,prices:{usd:"1.49",usd_foil:"3.49",eur:"1.20"},legalities:{standard:"not_legal",modern:"legal",legacy:"legal",commander:"legal",pauper:"not_legal"},keywords:[],image_uris:{small:"https://cards.scryfall.io/small/front/b/a/ba975f60-ca29-4fc8-b2f0-416be395f200.jpg?1628801672",normal:"https://cards.scryfall.io/normal/front/b/a/ba975f60-ca29-4fc8-b2f0-416be395f200.jpg?1628801672"}},
  {id:"x11",name:"Vandalblast",mana_cost:"{R}",cmc:1,type_line:"Sorcery",oracle_text:"Destroy target artifact you don't control.\nOverload {4}{R}",colors:["R"],color_identity:["R"],set_name:"Commander Masters",set:"cmm",rarity:"uncommon",power:null,toughness:null,prices:{usd:"0.79",usd_foil:"2.49",eur:"0.60"},legalities:{standard:"not_legal",modern:"not_legal",legacy:"legal",commander:"legal",pauper:"not_legal"},keywords:["Overload"],image_uris:{small:"https://cards.scryfall.io/small/front/4/c/4ce9072e-58e9-4e18-9331-4e3543e3d702.jpg?1691000153",normal:"https://cards.scryfall.io/normal/front/4/c/4ce9072e-58e9-4e18-9331-4e3543e3d702.jpg?1691000153"}},
  {id:"x12",name:"Generous Gift",mana_cost:"{2}{W}",cmc:3,type_line:"Instant",oracle_text:"Destroy target permanent. Its controller creates a 3/3 green Elephant creature token.",colors:["W"],color_identity:["W"],set_name:"Commander Masters",set:"cmm",rarity:"uncommon",power:null,toughness:null,prices:{usd:"0.49",usd_foil:"1.99",eur:"0.40"},legalities:{standard:"not_legal",modern:"not_legal",legacy:"legal",commander:"legal",pauper:"not_legal"},keywords:[],image_uris:{small:"https://cards.scryfall.io/small/front/c/f/cf80a8e3-1905-413c-a510-54fef2afde35.jpg?1691000099",normal:"https://cards.scryfall.io/normal/front/c/f/cf80a8e3-1905-413c-a510-54fef2afde35.jpg?1691000099"}},
  {id:"x13",name:"Anguished Unmaking",mana_cost:"{1}{W}{B}",cmc:3,type_line:"Instant",oracle_text:"Exile target nonland permanent. You lose 3 life.",colors:["W","B"],color_identity:["W","B"],set_name:"Shadows over Innistrad",set:"soi",rarity:"rare",power:null,toughness:null,prices:{usd:"3.49",usd_foil:"8.99",eur:"3.00"},legalities:{standard:"not_legal",modern:"legal",legacy:"legal",commander:"legal",pauper:"not_legal"},keywords:["Exile"],image_uris:{small:"https://cards.scryfall.io/small/front/9/0/90256572-3c43-4b73-a012-30cf1f4b4a35.jpg?1576385161",normal:"https://cards.scryfall.io/normal/front/9/0/90256572-3c43-4b73-a012-30cf1f4b4a35.jpg?1576385161"}},
  {id:"x14",name:"Assassin's Trophy",mana_cost:"{B}{G}",cmc:2,type_line:"Instant",oracle_text:"Destroy target permanent an opponent controls. Its controller may search their library for a basic land card, put it onto the battlefield, then shuffle.",colors:["B","G"],color_identity:["B","G"],set_name:"Guilds of Ravnica",set:"grn",rarity:"rare",power:null,toughness:null,prices:{usd:"5.99",usd_foil:"12.99",eur:"5.00"},legalities:{standard:"not_legal",modern:"legal",legacy:"legal",commander:"legal",pauper:"not_legal"},keywords:[],image_uris:{small:"https://cards.scryfall.io/small/front/9/0/906b6e99-128f-4c11-8daf-16571f51d8c7.jpg?1572893498",normal:"https://cards.scryfall.io/normal/front/9/0/906b6e99-128f-4c11-8daf-16571f51d8c7.jpg?1572893498"}},
  {id:"x15",name:"The Great Henge",mana_cost:"{7}{G}{G}",cmc:9,type_line:"Legendary Artifact",oracle_text:"This spell costs {X} less to cast, where X is the greatest power among creatures you control.\n{T}: Add {G}{G}. You gain 2 life.\nWhenever a nontoken creature enters the battlefield under your control, put a +1/+1 counter on it and draw a card.",colors:["G"],color_identity:["G"],set_name:"Throne of Eldraine",set:"eld",rarity:"mythic",power:null,toughness:null,prices:{usd:"39.99",usd_foil:"54.99",eur:"36.00"},legalities:{standard:"not_legal",modern:"legal",legacy:"legal",commander:"legal",pauper:"not_legal"},keywords:[],image_uris:{small:"https://cards.scryfall.io/small/front/a/f/af915ed2-1f34-43f6-85f5-2430325b720f.jpg?1572490580",normal:"https://cards.scryfall.io/normal/front/a/f/af915ed2-1f34-43f6-85f5-2430325b720f.jpg?1572490580"}},
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HELPERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Image map populated on mount from Scryfall collection API
let IMG_CACHE = {};
const cardImg = (name, version = "normal") => {
  const key = name.toLowerCase();
  if (IMG_CACHE[key]) {
    return version === "small" ? (IMG_CACHE[key].small || IMG_CACHE[key].normal) : IMG_CACHE[key].normal;
  }
  // Fallback: transparent pixel while loading
  return "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
};

// Fetch real image URLs from Scryfall on startup
async function loadCardImages(cards) {
  try {
    const identifiers = cards.map(c => ({ name: c.name }));
    const res = await fetch("https://api.scryfall.com/cards/collection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifiers })
    });
    const data = await res.json();
    if (data.data) {
      data.data.forEach(card => {
        const uris = card.image_uris || card.card_faces?.[0]?.image_uris;
        if (uris) {
          IMG_CACHE[card.name.toLowerCase()] = {
            small: uris.small,
            normal: uris.normal
          };
        }
      });
    }
  } catch (e) {
    console.error("Failed to load card images:", e);
  }
}

const fmt = (p) => p ? `$${parseFloat(p).toFixed(2)}` : "—";
const MCLR = { W:"#F9FAF4",U:"#0E68AB",B:"#211510",R:"#D3202A",G:"#00733E",C:"#CAC5C0" };
const MBDR = { W:"#C4B998",U:"#064A7A",B:"#44403C",R:"#9A1620",G:"#005C30",C:"#9E9A96" };
const MTXT = { W:"#444",U:"#fff",B:"#C9A96E",R:"#fff",G:"#fff",C:"#444" };

function Pip({s,sz=18}) {
  return <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:sz,height:sz,borderRadius:"50%",background:MCLR[s]||"#aaa",border:`1.5px solid ${MBDR[s]||"#666"}`,fontSize:sz*.55,fontWeight:800,color:MTXT[s]||"#fff",flexShrink:0}}>{s}</span>;
}
function Cost({c,sz=18}) {
  if(!c) return null;
  return <span style={{display:"inline-flex",gap:2,alignItems:"center"}}>{(c.match(/\{([^}]+)\}/g)||[]).map((p,i)=>{const s=p.replace(/[{}]/g,"");return "WUBRGC".includes(s)?<Pip key={i} s={s} sz={sz}/>:<span key={i} style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:sz,height:sz,borderRadius:"50%",background:"#ddd",border:"1.5px solid #bbb",fontSize:sz*.55,fontWeight:800,color:"#333"}}>{s}</span>;})}</span>;
}

const store = {
  async get(k){try{const v=localStorage.getItem(k);return v?JSON.parse(v):null}catch{return null}},
  async set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){console.error(e)}},
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// BOTTOM SHEET
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function BottomSheet({open,onClose,children}) {
  if(!open) return null;
  return (
    <div style={{position:"fixed",inset:0,zIndex:200,display:"flex",flexDirection:"column",justifyContent:"flex-end"}} onClick={onClose}>
      <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.7)"}}/>
      <div onClick={e=>e.stopPropagation()} style={{
        position:"relative",background:"#16182A",borderRadius:"20px 20px 0 0",
        maxHeight:"88vh",overflow:"auto",paddingBottom:32,
        animation:"slideUp .25s ease-out"
      }}>
        <div style={{display:"flex",justifyContent:"center",padding:"10px 0 4px"}}><div style={{width:40,height:4,borderRadius:2,background:"#3A3D4E"}}/></div>
        {children}
      </div>
      <style>{`@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MAIN APP
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export default function App() {
  const [tab,setTab]=useState("search");
  const [decks,setDecks]=useState([]);
  const [coll,setColl]=useState([]);
  const [ready,setReady]=useState(false);
  const [imgsLoaded,setImgsLoaded]=useState(false);

  useEffect(()=>{(async()=>{
    const d=await store.get("av-decks"),c=await store.get("av-coll");
    if(d)setDecks(d);if(c)setColl(c);setReady(true);
    // Fetch real image URLs from Scryfall
    await loadCardImages(CARDS_DB);
    setImgsLoaded(true);
  })()},[]);
  useEffect(()=>{if(ready)store.set("av-decks",decks)},[decks,ready]);
  useEffect(()=>{if(ready)store.set("av-coll",coll)},[coll,ready]);

  const addColl=useCallback((card)=>{
    setColl(p=>{const ex=p.find(c=>c.id===card.id);if(ex)return p.map(c=>c===ex?{...c,qty:c.qty+1}:c);return[...p,{...card,qty:1,addedAt:Date.now()}]});
  },[]);

  const addDeck=useCallback((did,card,board="main")=>{
    setDecks(p=>p.map(d=>{if(d.id!==did)return d;const ex=d.cards.find(c=>c.id===card.id&&c.board===board);if(ex)return{...d,cards:d.cards.map(c=>c===ex?{...c,qty:c.qty+1}:c)};return{...d,cards:[...d.cards,{...card,qty:1,board}]}}));
  },[]);

  const tabs=[
    {id:"search",icon:"🔍",label:"Search"},
    {id:"decks",icon:"📚",label:"Decks"},
    {id:"sim",icon:"🎲",label:"Simulator"},
    {id:"coll",icon:"📦",label:"Collection"},
    {id:"trade",icon:"⚖️",label:"Trade"},
  ];

  return (
    <div style={{minHeight:"100vh",background:"#0C0E14",fontFamily:"'SF Pro Text','Segoe UI',system-ui,sans-serif",color:"#E2E0DC",display:"flex",flexDirection:"column",maxWidth:480,margin:"0 auto",position:"relative"}}>
      {/* Loading overlay */}
      {!imgsLoaded&&<div style={{position:"fixed",inset:0,background:"#0C0E14",zIndex:999,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16}}>
        <div style={{fontSize:40}}>⚔️</div>
        <div style={{fontSize:16,fontWeight:700,background:"linear-gradient(135deg,#C9A96E,#F0D78C)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>ARCANE VAULT</div>
        <div style={{fontSize:12,color:"#5A5D6E",marginTop:4}}>Loading card images...</div>
        <div style={{width:120,height:3,borderRadius:2,background:"#1E2235",overflow:"hidden",marginTop:8}}>
          <div style={{width:"60%",height:"100%",background:"#C9A96E",borderRadius:2,animation:"pulse 1s ease-in-out infinite alternate"}}/>
        </div>
        <style>{`@keyframes pulse{from{opacity:.4;width:30%}to{opacity:1;width:80%}}`}</style>
      </div>}
      {/* Status bar spacer */}
      <div style={{height:8,background:"#0C0E14",flexShrink:0}}/>

      {/* Content area */}
      <div style={{flex:1,overflowY:"auto",paddingBottom:72}}>
        {tab==="search"&&<SearchView db={CARDS_DB} addColl={addColl} addDeck={addDeck} decks={decks}/>}
        {tab==="decks"&&<DecksView decks={decks} setDecks={setDecks} addDeck={addDeck} db={CARDS_DB}/>}
        {tab==="sim"&&<SimView decks={decks}/>}
        {tab==="coll"&&<CollView coll={coll} setColl={setColl}/>}
        {tab==="trade"&&<TradeView db={CARDS_DB}/>}
      </div>

      {/* Bottom Nav – iOS-style */}
      <div style={{
        position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:480,
        background:"rgba(12,14,20,.92)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",
        borderTop:"1px solid #1E2235",display:"flex",padding:"6px 0 env(safe-area-inset-bottom,8px)",zIndex:100
      }}>
        {tabs.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{
            flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2,
            background:"none",border:"none",cursor:"pointer",padding:"4px 0",
            color:tab===t.id?"#C9A96E":"#5A5D6E",transition:"color .15s"
          }}>
            <span style={{fontSize:20,lineHeight:1}}>{t.icon}</span>
            <span style={{fontSize:10,fontWeight:600,letterSpacing:.3}}>{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🔍 SEARCH
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function SearchView({db,addColl,addDeck,decks}) {
  const [q,setQ]=useState("");
  const [colors,setColors]=useState([]);
  const [type,setType]=useState("");
  const [sel,setSel]=useState(null);
  const [showAdd,setShowAdd]=useState(false);

  const results=useMemo(()=>{
    let r=[...db];
    if(q) r=r.filter(c=>c.name.toLowerCase().includes(q.toLowerCase())||c.oracle_text?.toLowerCase().includes(q.toLowerCase()));
    if(colors.length) r=r.filter(c=>colors.every(cl=>c.color_identity.includes(cl)));
    if(type) r=r.filter(c=>c.type_line.toLowerCase().includes(type));
    return r;
  },[db,q,colors,type]);

  return (
    <div style={{padding:"0 16px"}}>
      {/* Search input */}
      <div style={{position:"sticky",top:0,background:"#0C0E14",paddingTop:12,paddingBottom:8,zIndex:10}}>
        <div style={{position:"relative"}}>
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search cards..."
            style={{width:"100%",padding:"14px 16px 14px 42px",borderRadius:14,border:"1px solid #2A2D3E",background:"#16182A",color:"#E2E0DC",fontSize:16,outline:"none",boxSizing:"border-box"}}/>
          <span style={{position:"absolute",left:14,top:15,fontSize:18,opacity:.4}}>🔍</span>
        </div>
        {/* Color filter pills */}
        <div style={{display:"flex",gap:6,marginTop:8,overflowX:"auto",paddingBottom:4}}>
          {Object.keys(MCLR).map(c=>(
            <button key={c} onClick={()=>setColors(p=>p.includes(c)?p.filter(x=>x!==c):[...p,c])} style={{
              width:36,height:36,borderRadius:"50%",border:colors.includes(c)?"2.5px solid #C9A96E":"2px solid #333",
              background:MCLR[c],fontSize:13,fontWeight:800,color:MTXT[c],cursor:"pointer",
              opacity:colors.includes(c)?1:.45,transition:"all .15s",flexShrink:0
            }}>{c}</button>
          ))}
          <select value={type} onChange={e=>setType(e.target.value)} style={{
            padding:"0 12px",borderRadius:18,border:"1px solid #2A2D3E",background:"#16182A",
            color:"#9A9DAE",fontSize:12,cursor:"pointer",flexShrink:0,appearance:"none",minWidth:80,textAlign:"center"
          }}>
            <option value="">All types</option>
            {["Creature","Instant","Sorcery","Enchantment","Artifact","Planeswalker","Land"].map(t=>
              <option key={t} value={t.toLowerCase()}>{t}</option>
            )}
          </select>
        </div>
        <div style={{fontSize:11,color:"#5A5D6E",marginTop:4}}>{results.length} cards</div>
      </div>

      {/* Results */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,paddingTop:4,paddingBottom:16}}>
        {results.map(card=>(
          <div key={card.id} onClick={()=>setSel(card)} style={{
            borderRadius:12,overflow:"hidden",background:"#16182A",border:"1px solid #1E2235",
            WebkitTapHighlightColor:"transparent",cursor:"pointer",
            transition:"transform .1s",active:{transform:"scale(.97)"}
          }}>
            <img src={cardImg(card.name)} alt={card.name} loading="lazy"
              style={{width:"100%",display:"block",borderRadius:"12px 12px 0 0"}}/>
            <div style={{padding:"8px 10px 10px"}}>
              <div style={{fontSize:12,fontWeight:700,color:"#E2E0DC",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{card.name}</div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:4}}>
                <Cost c={card.mana_cost} sz={15}/>
                <span style={{fontSize:12,fontWeight:600,color:"#4ADE80"}}>{fmt(card.prices?.usd)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {results.length===0&&<div style={{textAlign:"center",padding:"60px 20px",color:"#5A5D6E"}}>
        <div style={{fontSize:44,marginBottom:12}}>🃏</div>
        <div style={{fontSize:14}}>No cards match your search</div>
      </div>}

      {/* Card Detail Bottom Sheet */}
      <BottomSheet open={!!sel} onClose={()=>{setSel(null);setShowAdd(false)}}>
        {sel&&(
          <div style={{padding:"0 20px"}}>
            <div style={{display:"flex",gap:14,paddingTop:8}}>
              <img src={cardImg(sel.name)} alt={sel.name} style={{width:140,borderRadius:10,flexShrink:0}}/>
              <div style={{flex:1,minWidth:0}}>
                <h3 style={{margin:"0 0 6px",fontSize:18,fontWeight:800,color:"#F0D78C"}}>{sel.name}</h3>
                <Cost c={sel.mana_cost} sz={20}/>
                <div style={{fontSize:12,color:"#9A9DAE",marginTop:6}}>{sel.type_line}</div>
                {sel.power&&<div style={{fontSize:13,color:"#C9A96E",marginTop:4,fontWeight:700}}>{sel.power}/{sel.toughness}</div>}
                <div style={{fontSize:11,color:"#6B6F80",marginTop:4}}>{sel.set_name} · {sel.rarity}</div>
              </div>
            </div>

            {/* Oracle text */}
            <div style={{marginTop:14,padding:14,background:"#0C0E14",borderRadius:12,fontSize:13,color:"#CCC",lineHeight:1.6}}>
              {sel.oracle_text?.split("\n").map((l,i)=><div key={i} style={{marginBottom:i<(sel.oracle_text.split("\n").length-1)?6:0}}>{l}</div>)}
            </div>

            {/* Prices */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginTop:12}}>
              {[["USD",sel.prices?.usd,"#4ADE80"],["Foil",sel.prices?.usd_foil,"#C084FC"],["EUR",sel.prices?.eur,"#60A5FA"]].map(([l,v,c])=>(
                <div key={l} style={{background:"#0C0E14",borderRadius:10,padding:"10px 12px",textAlign:"center"}}>
                  <div style={{fontSize:9,color:"#5A5D6E",textTransform:"uppercase",letterSpacing:.5}}>{l}</div>
                  <div style={{fontSize:16,fontWeight:700,color:c,marginTop:2}}>{fmt(v)}</div>
                </div>
              ))}
            </div>

            {/* Legalities */}
            {sel.legalities&&<div style={{display:"flex",flexWrap:"wrap",gap:4,marginTop:12}}>
              {Object.entries(sel.legalities).map(([f,v])=>(
                <span key={f} style={{
                  padding:"3px 8px",borderRadius:6,fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:.3,
                  background:v==="legal"?"#0F2A1A":v==="banned"?"#2A0F0F":"#1A1A2A",
                  color:v==="legal"?"#4ADE80":v==="banned"?"#EF4444":"#5A5D6E",
                }}>{f}</span>
              ))}
            </div>}

            {/* Actions */}
            <div style={{display:"flex",gap:10,marginTop:16,marginBottom:8}}>
              <button onClick={()=>{addColl(sel);setSel(null)}} style={{
                flex:1,padding:"14px",borderRadius:12,border:"none",
                background:"linear-gradient(135deg,#C9A96E,#A88B4A)",color:"#000",
                fontSize:14,fontWeight:700,cursor:"pointer"
              }}>+ Collection</button>
              <button onClick={()=>setShowAdd(!showAdd)} style={{
                flex:1,padding:"14px",borderRadius:12,border:"2px solid #C9A96E",
                background:"transparent",color:"#C9A96E",fontSize:14,fontWeight:700,cursor:"pointer"
              }}>+ Deck</button>
            </div>
            {showAdd&&decks.length>0&&<div style={{marginBottom:12}}>
              {decks.map(d=>(
                <button key={d.id} onClick={()=>{addDeck(d.id,sel);setSel(null);setShowAdd(false)}} style={{
                  display:"block",width:"100%",padding:"12px 14px",marginBottom:4,borderRadius:10,
                  border:"1px solid #2A2D3E",background:"#0C0E14",color:"#E2E0DC",
                  fontSize:13,cursor:"pointer",textAlign:"left"
                }}>{d.name} <span style={{color:"#5A5D6E",fontSize:11}}>({d.format})</span></button>
              ))}
            </div>}
            {showAdd&&decks.length===0&&<div style={{padding:12,color:"#5A5D6E",fontSize:12,textAlign:"center"}}>Create a deck first in the Decks tab</div>}
          </div>
        )}
      </BottomSheet>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 📚 DECKS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function DecksView({decks,setDecks,addDeck,db}) {
  const [active,setActive]=useState(null);
  const [showNew,setShowNew]=useState(false);
  const [name,setName]=useState("");
  const [format,setFormat]=useState("commander");
  const [addQ,setAddQ]=useState("");

  const deck=decks.find(d=>d.id===active);

  const create=()=>{
    if(!name.trim())return;
    const d={id:Date.now().toString(),name,format,cards:[],ts:Date.now()};
    setDecks(p=>[...p,d]);setActive(d.id);setName("");setShowNew(false);
  };

  const rmCard=(cid,board)=>setDecks(p=>p.map(d=>{
    if(d.id!==active)return d;
    const c=d.cards.find(x=>x.id===cid&&x.board===board);
    if(!c)return d;
    return c.qty>1?{...d,cards:d.cards.map(x=>x===c?{...x,qty:x.qty-1}:x)}:{...d,cards:d.cards.filter(x=>x!==c)};
  }));

  const addResults=useMemo(()=>addQ.length<2?[]:db.filter(c=>c.name.toLowerCase().includes(addQ.toLowerCase())).slice(0,8),[addQ,db]);

  const stats=useMemo(()=>{
    if(!deck)return null;
    const main=deck.cards.filter(c=>c.board==="main"||c.board==="commander");
    const curve={};const clrs={};const types={};let val=0;
    main.forEach(c=>{
      const cmc=Math.min(Math.floor(c.cmc||0),7);
      curve[cmc]=(curve[cmc]||0)+c.qty;
      (c.mana_cost?.match(/\{([WUBRGC])\}/g)||[]).forEach(m=>{const s=m[1];clrs[s]=(clrs[s]||0)+c.qty});
      const tp=(c.type_line||"").split("—")[0].trim().split(" ").pop();
      if(tp)types[tp]=(types[tp]||0)+c.qty;
      if(c.prices?.usd)val+=parseFloat(c.prices.usd)*c.qty;
    });
    const total=deck.cards.reduce((a,c)=>a+c.qty,0);
    return{curve,clrs,types,val,total};
  },[deck]);

  if(!active) return (
    <div style={{padding:16}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <h2 style={{margin:0,fontSize:20,fontWeight:800,color:"#F0D78C"}}>My Decks</h2>
        <button onClick={()=>setShowNew(!showNew)} style={{padding:"10px 16px",borderRadius:12,border:"none",background:"linear-gradient(135deg,#C9A96E,#A88B4A)",color:"#000",fontSize:13,fontWeight:700,cursor:"pointer"}}>+ New</button>
      </div>
      {showNew&&<div style={{background:"#16182A",borderRadius:14,border:"1px solid #2A2D3E",padding:16,marginBottom:16}}>
        <input value={name} onChange={e=>setName(e.target.value)} placeholder="Deck name" onKeyDown={e=>e.key==="Enter"&&create()}
          style={{width:"100%",padding:"12px 14px",borderRadius:10,border:"1px solid #2A2D3E",background:"#0C0E14",color:"#E2E0DC",fontSize:15,marginBottom:8,boxSizing:"border-box"}}/>
        <div style={{display:"flex",gap:8}}>
          <select value={format} onChange={e=>setFormat(e.target.value)} style={{flex:1,padding:"10px 12px",borderRadius:10,border:"1px solid #2A2D3E",background:"#0C0E14",color:"#E2E0DC",fontSize:13}}>
            {["commander","standard","modern","pioneer","legacy","vintage","pauper"].map(f=><option key={f} value={f}>{f[0].toUpperCase()+f.slice(1)}</option>)}
          </select>
          <button onClick={create} style={{padding:"10px 24px",borderRadius:10,border:"none",background:"#C9A96E",color:"#000",fontSize:13,fontWeight:700,cursor:"pointer"}}>Create</button>
        </div>
      </div>}
      {decks.length===0?<div style={{textAlign:"center",padding:"60px 20px",color:"#5A5D6E"}}><div style={{fontSize:44,marginBottom:12}}>📚</div>No decks yet</div>
      :decks.map(d=>{const n=d.cards.reduce((a,c)=>a+c.qty,0);const v=d.cards.reduce((a,c)=>a+(parseFloat(c.prices?.usd||0)*c.qty),0);return(
        <div key={d.id} onClick={()=>setActive(d.id)} style={{background:"#16182A",border:"1px solid #1E2235",borderRadius:14,padding:16,marginBottom:8,cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:15,fontWeight:700}}>{d.name}</div>
            <div style={{fontSize:12,color:"#5A5D6E",marginTop:2}}>{d.format[0].toUpperCase()+d.format.slice(1)} · {n} cards</div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:14,fontWeight:700,color:"#4ADE80"}}>{fmt(v.toFixed(2))}</div>
            <button onClick={e=>{e.stopPropagation();setDecks(p=>p.filter(x=>x.id!==d.id))}} style={{marginTop:4,padding:"4px 10px",borderRadius:6,border:"1px solid #444",background:"transparent",color:"#EF4444",fontSize:10,cursor:"pointer"}}>Delete</button>
          </div>
        </div>
      )})}
    </div>
  );

  // Deck editor
  const mx=Math.max(...Object.values(stats?.curve||{0:1}),1);
  return (
    <div style={{padding:16}}>
      <button onClick={()=>setActive(null)} style={{padding:"8px 14px",borderRadius:8,border:"1px solid #2A2D3E",background:"transparent",color:"#5A5D6E",fontSize:13,cursor:"pointer",marginBottom:12}}>← Back</button>
      <h2 style={{margin:"0 0 2px",fontSize:18,fontWeight:800,color:"#F0D78C"}}>{deck.name}</h2>
      <div style={{fontSize:12,color:"#5A5D6E",marginBottom:14}}>{deck.format} · {stats.total} cards · {fmt(stats.val.toFixed(2))}</div>

      {/* Mana Curve */}
      <div style={{background:"#16182A",borderRadius:14,border:"1px solid #1E2235",padding:14,marginBottom:12}}>
        <div style={{fontSize:11,color:"#5A5D6E",marginBottom:8,fontWeight:600}}>Mana Curve</div>
        <div style={{display:"flex",alignItems:"flex-end",gap:4,height:56}}>
          {[0,1,2,3,4,5,6,7].map(cmc=>(
            <div key={cmc} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center"}}>
              <div style={{fontSize:9,color:"#5A5D6E",marginBottom:2}}>{stats.curve[cmc]||0}</div>
              <div style={{width:"100%",borderRadius:"4px 4px 0 0",height:`${((stats.curve[cmc]||0)/mx)*40}px`,background:"linear-gradient(180deg,#C9A96E,#7A6530)",transition:"height .3s"}}/>
              <div style={{fontSize:9,color:"#5A5D6E",marginTop:2}}>{cmc===7?"7+":cmc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Color distribution */}
      {Object.keys(stats.clrs).length>0&&<div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
        {Object.entries(stats.clrs).map(([c,n])=><div key={c} style={{display:"flex",alignItems:"center",gap:4,background:"#16182A",borderRadius:10,padding:"6px 10px"}}><Pip s={c} sz={20}/><span style={{fontSize:14,fontWeight:700}}>{n}</span></div>)}
      </div>}

      {/* Add cards */}
      <input value={addQ} onChange={e=>setAddQ(e.target.value)} placeholder="Search cards to add..."
        style={{width:"100%",padding:"12px 14px",borderRadius:12,border:"1px solid #2A2D3E",background:"#16182A",color:"#E2E0DC",fontSize:14,boxSizing:"border-box",marginBottom:4}}/>
      {addResults.length>0&&<div style={{background:"#16182A",borderRadius:12,border:"1px solid #2A2D3E",marginBottom:12,overflow:"hidden"}}>
        {addResults.map(c=>(
          <div key={c.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 12px",borderBottom:"1px solid #1E2235"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,minWidth:0,flex:1}}>
              <Cost c={c.mana_cost} sz={14}/>
              <span style={{fontSize:13,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.name}</span>
            </div>
            <div style={{display:"flex",gap:4,flexShrink:0}}>
              <button onClick={()=>addDeck(active,c,"main")} style={{padding:"6px 12px",borderRadius:8,border:"none",background:"#C9A96E",color:"#000",fontSize:11,fontWeight:700,cursor:"pointer"}}>Main</button>
              <button onClick={()=>addDeck(active,c,"sideboard")} style={{padding:"6px 12px",borderRadius:8,border:"1px solid #444",background:"transparent",color:"#999",fontSize:11,cursor:"pointer"}}>Side</button>
            </div>
          </div>
        ))}
      </div>}

      {/* Card list by board */}
      {["commander","main","sideboard"].map(board=>{
        const cards=deck.cards.filter(c=>c.board===board);if(!cards.length)return null;
        return <div key={board} style={{marginBottom:14}}>
          <div style={{fontSize:11,fontWeight:700,color:"#C9A96E",textTransform:"uppercase",marginBottom:6,letterSpacing:.5}}>{board} ({cards.reduce((a,c)=>a+c.qty,0)})</div>
          {cards.map(c=>(
            <div key={c.id+c.board} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 10px",borderRadius:8,marginBottom:2,background:"#16182A"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,minWidth:0,flex:1}}>
                <span style={{fontSize:12,color:"#5A5D6E",width:22,textAlign:"center"}}>{c.qty}×</span>
                <Cost c={c.mana_cost} sz={13}/>
                <span style={{fontSize:13,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.name}</span>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
                <span style={{fontSize:11,color:"#4ADE80"}}>{fmt(c.prices?.usd)}</span>
                <button onClick={()=>rmCard(c.id,board)} style={{width:28,height:28,borderRadius:8,border:"none",background:"#1E1215",color:"#EF4444",fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>−</button>
              </div>
            </div>
          ))}
        </div>;
      })}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🎲 SIMULATOR
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function SimView({decks}) {
  const [did,setDid]=useState("");
  const [hand,setHand]=useState([]);
  const [lib,setLib]=useState([]);
  const [mulls,setMulls]=useState(0);
  const [drawn,setDrawn]=useState([]);
  const [turn,setTurn]=useState(0);

  const deck=decks.find(d=>d.id===did);
  const shuffle=(a)=>{const b=[...a];for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]]}return b};

  const buildLib=()=>{if(!deck)return[];const c=[];deck.cards.filter(x=>x.board==="main"||x.board==="commander").forEach(x=>{for(let i=0;i<x.qty;i++)c.push({...x,uid:x.id+"-"+i+"-"+Math.random()})});return shuffle(c)};

  const newGame=()=>{const l=buildLib();setHand(l.slice(0,7));setLib(l.slice(7));setMulls(0);setDrawn([]);setTurn(0)};
  const mull=()=>{const l=buildLib();setHand(l.slice(0,7));setLib(l.slice(7));setMulls(m=>m+1);setDrawn([]);setTurn(0)};
  const draw=()=>{if(!lib.length)return;setDrawn(p=>[...p,lib[0]]);setLib(p=>p.slice(1));setTurn(t=>t+1)};

  return (
    <div style={{padding:16}}>
      <h2 style={{margin:"0 0 12px",fontSize:20,fontWeight:800,color:"#F0D78C"}}>Simulator</h2>
      <select value={did} onChange={e=>{setDid(e.target.value);setHand([]);setLib([]);setDrawn([])}}
        style={{width:"100%",padding:"12px 14px",borderRadius:12,border:"1px solid #2A2D3E",background:"#16182A",color:"#E2E0DC",fontSize:14,marginBottom:12,boxSizing:"border-box"}}>
        <option value="">Select a deck...</option>
        {decks.map(d=><option key={d.id} value={d.id}>{d.name} ({d.cards.reduce((a,c)=>a+c.qty,0)})</option>)}
      </select>

      {did&&<div style={{display:"flex",gap:8,marginBottom:14}}>
        <button onClick={newGame} style={{flex:1,padding:"12px",borderRadius:12,border:"none",background:"linear-gradient(135deg,#C9A96E,#A88B4A)",color:"#000",fontSize:13,fontWeight:700,cursor:"pointer"}}>🔄 New Hand</button>
        <button onClick={mull} disabled={!hand.length} style={{flex:1,padding:"12px",borderRadius:12,border:"2px solid #C9A96E",background:"transparent",color:"#C9A96E",fontSize:13,fontWeight:700,cursor:"pointer",opacity:hand.length?1:.4}}>♻ Mulligan{mulls>0?` (${mulls})`:""}</button>
        <button onClick={draw} disabled={!lib.length||!hand.length} style={{padding:"12px 16px",borderRadius:12,border:"2px solid #4ADE80",background:"transparent",color:"#4ADE80",fontSize:13,fontWeight:700,cursor:"pointer",opacity:lib.length&&hand.length?1:.4}}>📥</button>
      </div>}

      {hand.length>0&&<>
        <div style={{display:"flex",gap:12,fontSize:12,color:"#5A5D6E",marginBottom:10}}>
          <span>Library: {lib.length}</span><span>Hand: {hand.length}</span>{turn>0&&<span>Turn {turn}</span>}
        </div>
        <div style={{fontSize:11,color:"#C9A96E",fontWeight:700,marginBottom:6}}>Opening Hand</div>
        <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:10,WebkitOverflowScrolling:"touch"}}>
          {hand.map(c=>(
            <div key={c.uid} style={{flexShrink:0,width:110}}>
              <img src={cardImg(c.name,"small")} alt={c.name} style={{width:110,borderRadius:8,display:"block"}}/>
              <div style={{fontSize:10,color:"#E2E0DC",marginTop:4,textAlign:"center",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.name}</div>
            </div>
          ))}
        </div>
      </>}

      {drawn.length>0&&<>
        <div style={{fontSize:11,color:"#4ADE80",fontWeight:700,marginTop:8,marginBottom:6}}>Drawn</div>
        <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:10,WebkitOverflowScrolling:"touch"}}>
          {drawn.map((c,i)=>(
            <div key={c.uid} style={{flexShrink:0,width:90}}>
              <img src={cardImg(c.name,"small")} alt={c.name} style={{width:90,borderRadius:6,display:"block"}}/>
              <div style={{fontSize:9,color:"#5A5D6E",marginTop:2,textAlign:"center"}}>T{i+1}</div>
            </div>
          ))}
        </div>
      </>}

      {!did&&<div style={{textAlign:"center",padding:"60px 20px",color:"#5A5D6E"}}><div style={{fontSize:44,marginBottom:12}}>🎲</div>Select a deck to simulate</div>}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 📦 COLLECTION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function CollView({coll,setColl}) {
  const [filter,setFilter]=useState("");
  const [sort,setSort]=useState("name");

  const totalVal=coll.reduce((a,c)=>a+(parseFloat(c.prices?.usd||0)*c.qty),0);
  const totalCards=coll.reduce((a,c)=>a+c.qty,0);

  const items=useMemo(()=>{
    let r=[...coll];
    if(filter) r=r.filter(c=>c.name.toLowerCase().includes(filter.toLowerCase()));
    r.sort((a,b)=>{
      if(sort==="name")return a.name.localeCompare(b.name);
      if(sort==="price")return(parseFloat(b.prices?.usd||0))-(parseFloat(a.prices?.usd||0));
      if(sort==="recent")return(b.addedAt||0)-(a.addedAt||0);
      return 0;
    });
    return r;
  },[coll,filter,sort]);

  const adj=(id,d)=>setColl(p=>p.map(c=>{if(c.id!==id)return c;const n=c.qty+d;return n<=0?null:{...c,qty:n}}).filter(Boolean));

  return (
    <div style={{padding:16}}>
      <h2 style={{margin:"0 0 12px",fontSize:20,fontWeight:800,color:"#F0D78C"}}>Collection</h2>

      {/* Stats */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}}>
        {[["Unique",coll.length,"#E2E0DC"],["Total",totalCards,"#E2E0DC"],["Value","$"+totalVal.toFixed(2),"#4ADE80"]].map(([l,v,c])=>(
          <div key={l} style={{background:"#16182A",borderRadius:12,border:"1px solid #1E2235",padding:"12px",textAlign:"center"}}>
            <div style={{fontSize:10,color:"#5A5D6E",textTransform:"uppercase",letterSpacing:.5}}>{l}</div>
            <div style={{fontSize:18,fontWeight:800,color:c,marginTop:2}}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{display:"flex",gap:8,marginBottom:12}}>
        <input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Filter..."
          style={{flex:1,padding:"10px 14px",borderRadius:10,border:"1px solid #2A2D3E",background:"#16182A",color:"#E2E0DC",fontSize:13}}/>
        <select value={sort} onChange={e=>setSort(e.target.value)}
          style={{padding:"10px 12px",borderRadius:10,border:"1px solid #2A2D3E",background:"#16182A",color:"#9A9DAE",fontSize:12}}>
          <option value="name">A-Z</option><option value="price">Price ↓</option><option value="recent">Recent</option>
        </select>
      </div>

      {coll.length===0?<div style={{textAlign:"center",padding:"60px 20px",color:"#5A5D6E"}}><div style={{fontSize:44,marginBottom:12}}>📦</div>Your collection is empty<div style={{fontSize:12,marginTop:4}}>Add cards from the Search tab</div></div>
      :items.map(c=>(
        <div key={c.id} style={{display:"flex",alignItems:"center",padding:"10px 12px",borderRadius:10,marginBottom:4,background:"#16182A"}}>
          <img src={cardImg(c.name,"small")} alt={c.name} style={{width:40,height:56,borderRadius:4,objectFit:"cover",marginRight:10}}/>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:13,fontWeight:700,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.name}</div>
            <div style={{display:"flex",gap:4,alignItems:"center",marginTop:2}}><Cost c={c.mana_cost} sz={12}/><span style={{fontSize:10,color:"#5A5D6E"}}>{c.set_name}</span></div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
            <button onClick={()=>adj(c.id,-1)} style={{width:30,height:30,borderRadius:8,border:"none",background:"#1E1215",color:"#EF4444",fontSize:16,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>−</button>
            <span style={{fontSize:14,fontWeight:700,minWidth:20,textAlign:"center"}}>{c.qty}</span>
            <button onClick={()=>adj(c.id,1)} style={{width:30,height:30,borderRadius:8,border:"none",background:"#0F1E15",color:"#4ADE80",fontSize:16,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
            <span style={{fontSize:12,color:"#4ADE80",minWidth:48,textAlign:"right",fontWeight:600}}>{fmt(c.prices?.usd)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ⚖️ TRADE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function TradeView({db}) {
  const [give,setGive]=useState([]);
  const [recv,setRecv]=useState([]);
  const [side,setSide]=useState(null);
  const [q,setQ]=useState("");

  const results=useMemo(()=>q.length<2?[]:db.filter(c=>c.name.toLowerCase().includes(q.toLowerCase())).slice(0,6),[q,db]);

  const add=(card)=>{
    const e={...card,uid:Date.now()};
    if(side==="give")setGive(p=>[...p,e]);else setRecv(p=>[...p,e]);
    setSide(null);setQ("");
  };

  const giveT=give.reduce((a,c)=>a+(parseFloat(c.prices?.usd||0)),0);
  const recvT=recv.reduce((a,c)=>a+(parseFloat(c.prices?.usd||0)),0);
  const diff=giveT-recvT;

  const Side=({title,cards,s,total,clr,onRm})=>(
    <div style={{flex:1}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
        <span style={{fontSize:13,fontWeight:700,color:clr}}>{title}</span>
        <span style={{fontSize:13,fontWeight:700,color:"#4ADE80"}}>${total.toFixed(2)}</span>
      </div>
      <div style={{background:"#16182A",borderRadius:12,border:`1px solid ${clr}22`,minHeight:100,padding:8}}>
        {cards.map(c=>(
          <div key={c.uid} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 8px",borderRadius:8,marginBottom:3,background:"#0C0E14"}}>
            <span style={{fontSize:11,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",flex:1}}>{c.name}</span>
            <div style={{display:"flex",alignItems:"center",gap:4,flexShrink:0}}>
              <span style={{fontSize:10,color:"#4ADE80"}}>{fmt(c.prices?.usd)}</span>
              <button onClick={()=>onRm(c.uid)} style={{width:22,height:22,borderRadius:6,border:"none",background:"#2A1515",color:"#EF4444",fontSize:11,cursor:"pointer"}}>✕</button>
            </div>
          </div>
        ))}
        <button onClick={()=>{setSide(s);setQ("")}} style={{width:"100%",padding:"10px",borderRadius:8,border:"1px dashed #2A2D3E",background:"transparent",color:"#5A5D6E",fontSize:12,cursor:"pointer",marginTop:4}}>+ Add card</button>
      </div>
    </div>
  );

  return (
    <div style={{padding:16}}>
      <h2 style={{margin:"0 0 14px",fontSize:20,fontWeight:800,color:"#F0D78C"}}>Trade Tool</h2>

      {/* Search overlay */}
      <BottomSheet open={!!side} onClose={()=>setSide(null)}>
        <div style={{padding:"8px 20px 20px"}}>
          <div style={{fontSize:14,fontWeight:700,color:"#F0D78C",marginBottom:10}}>Add to {side==="give"?"Give":"Receive"}</div>
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search card..." autoFocus
            style={{width:"100%",padding:"12px 14px",borderRadius:10,border:"1px solid #2A2D3E",background:"#0C0E14",color:"#E2E0DC",fontSize:14,boxSizing:"border-box",marginBottom:6}}/>
          {results.map(c=>(
            <div key={c.id} onClick={()=>add(c)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px",borderRadius:10,marginBottom:2,background:"#0C0E14",cursor:"pointer"}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}><Cost c={c.mana_cost} sz={14}/><span style={{fontSize:13}}>{c.name}</span></div>
              <span style={{fontSize:12,color:"#4ADE80",fontWeight:600}}>{fmt(c.prices?.usd)}</span>
            </div>
          ))}
        </div>
      </BottomSheet>

      <div style={{display:"flex",gap:10}}>
        <Side title="You Give" cards={give} s="give" total={giveT} clr="#EF4444" onRm={uid=>setGive(p=>p.filter(c=>c.uid!==uid))}/>
        <Side title="You Get" cards={recv} s="recv" total={recvT} clr="#4ADE80" onRm={uid=>setRecv(p=>p.filter(c=>c.uid!==uid))}/>
      </div>

      {(give.length>0||recv.length>0)&&<div style={{marginTop:16,background:"#16182A",borderRadius:14,border:"1px solid #1E2235",padding:16,textAlign:"center"}}>
        <div style={{fontSize:11,color:"#5A5D6E",marginBottom:6}}>Trade Balance</div>
        <div style={{fontSize:22,fontWeight:800,color:Math.abs(diff)<1?"#4ADE80":diff>0?"#EF4444":"#60A5FA"}}>
          {Math.abs(diff)<0.5?"✓ Fair Trade":diff>0?`You overpay $${diff.toFixed(2)}`:`You gain $${Math.abs(diff).toFixed(2)}`}
        </div>
        <div style={{marginTop:10,height:8,borderRadius:4,background:"#0C0E14",overflow:"hidden"}}>
          {(giveT+recvT)>0&&<div style={{width:`${(giveT/(giveT+recvT))*100}%`,height:"100%",borderRadius:4,background:Math.abs(diff)<1?"#4ADE80":"linear-gradient(90deg,#EF4444,#C9A96E)",transition:"width .3s"}}/>}
        </div>
        <div style={{display:"flex",justifyContent:"space-between",marginTop:6,fontSize:10,color:"#5A5D6E"}}>
          <span>Give: ${giveT.toFixed(2)}</span><span>Get: ${recvT.toFixed(2)}</span>
        </div>
      </div>}
    </div>
  );
}
