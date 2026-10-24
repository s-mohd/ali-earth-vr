# Pedagogy and Arabic-content review: «مغامرة المستكشف علي في عالم الأرض المتغيّرة»

Scope: grade-3 science (Kingdom of Bahrain), lesson «الأرضُ تتغيّر». Objective: the learner **identifies and distinguishes** five surface-change phenomena: the earthquake (الزلزال), the volcano (البركان), weathering (التجوية), erosion (التعرية) and human changes to the land surface (تغييرات الإنسان لسطح الأرض). The weathering/erosion contrast is the hardest part.

Sources: `ref/v1_app.js` (V1, beautified), `ref/v2.html` (V2). Line numbers point to those files.
Evidence screenshots (generated for this review, headless WebGL):
- V1: `shots/ped_v1_*.png`, made by `tools/ped_v1.mjs` (all 5 stations at intro, mid and end; both practice questions with a wrong then a right answer; all 5 quiz items; a fail result of 3/5).
- V2: `shots/ped_v2_*.png`, made by `tools/ped_v2.mjs` (all 5 stations before, mid and end; both practice questions answered wrongly; quiz Q1 and Q2).

---

## 0. Executive verdict (the 12 things that matter most)

1. **Both versions use the same 5-item quiz** (V1 `rm` 5123-5212 = V2 `QUIZ` 1610-1616): same prompts, same pictures, same correct positions (ب، ج، أ، ب، ج), and **no shuffling** in either. A retry is a memory test of positions.
2. **The option captions give the answers away.** Q1's correct caption is «طريق متشقّق بسبب **زلزال**» for the prompt «أيّ صورة تُظهر **زلزالًا**؟». The erosion and weathering captions repeat the definitions word for word («ينقل التربة وفتات الصخور»، «تتفتّت في مكانها»). A child can pass by matching words, without understanding a single picture.
3. **The quiz pictures are the same scenes the child just watched** (thumbnails rendered from the station models: V2 `renderThumbs` 1756-1770, V1 `nh` 7734). The quiz tests recognition of one image, not transfer to a new example.
4. **Weathering is animated with no cause and, in V2, no time cue.** The rock wobbles (V2 1408), then flies apart with a bounce (V2 1410-1414) in about 8 s. Children can conclude that weathering is sudden and forceful, which makes it look like a small earthquake. V1 at least shows «محاكاة مسرّعة» (3619), but that phrase is too hard for an 8-year-old.
5. **Erosion is shown only with water** (V1 `Fm` 6536, V2 `buildErosion` 1424-1508). The visual rule children will learn is "water means erosion". Wind erosion of sand is the example Bahraini children know best, and it is missing.
6. **V1 has the better science text.** Its definitions are textbook-style and precise (3586-3650): «اهتزاز مفاجئ في القشرة الأرضية»، «قد تظهر تشققات…»، «تخرج منه مواد بركانية، ومنها الحمم». V2's boards show scene captions, not definitions (1588-1597). One of them, «اهتزاز الأرض وظهور شقوق», says that cracks always appear.
7. **V2 has the better child language.** Lines are short. It uses partial tashkeel (55 of 118 strings have marks, against 25 of 117 in V1). Names stay hidden until the child watches («ما اسم هذا المظهر؟ شاهِد لتعرف», 1655-1656). It adds the mnemonic chips «التجوية = تفتُّت» and «التعرية = انتقال» (1592-1595), gives corrective feedback for each question (1611-1615), and Ali reads every question aloud (1910).
8. **Feedback after a wrong answer:** V1 says only «الإجابة الصحيحة باللون الأخضر» (5090-5094), which teaches nothing and depends on colour alone. V2 explains the concept but gives no second try in practice (1874-1881). V1 lets the child retry practice until correct and counts the tries (9517-9550), which is better. **Combine the two:** V2's specific explanation plus V1's active retry.
9. **Gender and number of address:** neither version handles them. Bahrain's public primary schools are single-sex, so half the users are girls. Yet Ali says «أحسنت يا بطل» (V2 1617), «هل أنت مستعد؟» (V2 1889) and «يا صديقي» (V1 5099), and the certificate reads «لإكماله… وتمييزه» (V1 5109). V1 also switches between plural («انظروا، راقبوا، أحسنتم»: 3590, 3601, 3624, 3647) and singular («فكّر، اختر»).
10. **Teacher tools exist only in V1, and they are good.** V1 records attempts per device, details each question, counts errors per concept, explains a wrong choice as «اختار «التجوية» بدل «التعرية»» (8668-8674), exports CSV (8697-8740) and stores no names (8522, 9038). V2 keeps only the best and last score (1946-1951). Keep V1's tools and extend them.
11. **VR safety and age:** Meta's minimum age for Quest is 10 and over, with a parent-managed account. V1 itself states this (8463). Grade-3 pupils are 8-9 years old. The new game must make screen and tablet a full, equal path, keep VR sessions short, supervised and approved by the school, and build break reminders into the flow.
12. **Flow bugs that affect learning, in V2:** the child's first line is the review line, not the welcome. The boot calls `enter('hub')` (2145), which sets `visitedHub` (1804-1805), so the real start (2153) says «اختر محطة لمراجعتها…». In V2 the child can also skip watching («التالي» is always active, 1696/1799) and jump straight to the challenge from the hub (1684). With gaze-only input, a 1.6 s dwell can answer a scored question by accident (2047). V1 requires watching (9561) and unlocks stations in order (9802-9806). That order is better for a first pass.

**What to keep from each version:**

| Keep from V1 | Keep from V2 |
|---|---|
| Station definitions and notes (3586-3650) | Short lines with partial tashkeel |
| «ماذا سيحدث؟» board before watching (5069, 5430) | Names hidden until watched (1655-1656) |
| Watch-before-next and ordered unlocking, with free review afterwards | «= تفتُّت / = انتقال» chips (1592-1595) |
| Weathering-vs-erosion comparison board (3627-3630) | «من هنا / إلى هنا» signs in erosion (1476), the basis for the evidence hunt |
| Practice retried until correct, with tries counted (9517-9550) | Before/after comparison with a photo easel (1702-1703, 1842-1853) |
| Teacher dashboard and CSV (8617-9120) | Corrective feedback per question (1611-1615) |
| Certificate with an optional name that is never saved (8504-8549, 8778-8895) | Ali reads each question aloud (1910) |
| Ali in Gulf dress (ghutra and agal), which children here recognise as local | Teacher safety notes on the start screen (101-107) |
| | Seated comfort: fades and 30° snap turns |

---

## 1. Side-by-side flow

| Step | V1 | V2 |
|---|---|---|
| Welcome | One block of 5 lines, about 28 words, plural address (5059-5064) | One line on the intro card (88). In-world greeting is skipped (bug, see item 12) |
| Navigation | Ordered unlock; challenge locked until all stations are done (7941-7950, 9798-9830) | Free hub. Challenge open at any time (1682-1689) |
| Before watching | Ali asks a question (`intro`). Board shows «ماذا سيحدث؟». Watch buttons name the phenomenon in 4 of 5 stations («شاهد الزلزال»، «شاهد التعرية», 3592-3640) | Board: «ما اسم هذا المظهر؟ شاهِد لتعرف». Ali: «انظر… ثم اضغط «شاهِد»» (no prediction) |
| After watching | Ali gives a one-line `outro`. Board shows title, definition and note. Erosion board adds the comparison images | Ali's `after` line. Board shows the name, a chip and a caption (no definition) |
| Practice | Weathering and erosion, retried until correct, tries counted | Weathering and erosion, one attempt, then «تابِع» |
| Challenge | 5 items, first answer counts (`yh` 8584-8596). Ali speaks only on Q1 («فكّر جيدًا ثم اختر!», 9650). Wrong answer: generic message, colour only | 5 identical items, first answer counts (1914). Ali reads each prompt. Wrong answer: one corrective line per item |
| Results | Score, percent and stars. Certificate on pass. Ali's fail line is generic | Score, percent and stars. Badge on pass. Ali says the number on a fail («حصلت على 1 من 5…», 1942) |
| Teacher | Dashboard, CSV, per-concept errors, practice tries | None in the game. Best and last score on the start card (2131) |

---

## 2. (a) Scientific accuracy: definitions and what each animation shows

### 2.1 Earthquake (الزلزال)
- **V1 definition** (3592-3594): «اهتزاز مفاجئ في القشرة الأرضية.», with the note «قد تظهر تشققات في الأرض بعد بعض الزلازل.». Accurate. The hedge «قد / بعض» is correct.
- **V2 caption** (1588): «اهتزاز الأرض وظهور شقوق». It implies that every earthquake leaves cracks (a misconception) and it drops «مفاجئ» (sudden), which is the attribute that separates an earthquake from slow changes.
- **Animations:** in both, the ground and houses shake and a zigzag crack opens across the road (`ped_v1_s1_c_end.png`, `ped_v2_s1_c_end.png`). V2 shakes the scene content, not the camera (1326), which is good for comfort. Nothing collapses and nobody is hurt, which suits 8-year-olds. Keep it that way.
- **Missing:** the crust is never explained. Add a one-line gloss: «القشرةُ الأرضيّة: الطبقةُ التي نعيشُ عليها». A small cut-away showing the ground in layers is optional.
- **Distinguishing risk:** «cracks» appear in both the earthquake and weathering scenes. The script must name the difference: the earthquake is *sudden shaking of the ground*; weathering is *slow breaking of a rock*.

### 2.2 Volcano (البركان)
- **V1** (3599-3606): «تخرج منه مواد بركانية، ومنها الحمم.». This matches the objective ("volcanic materials, including lava"), but the sentence has no subject. Make it a full sentence.
- **V2** (1590-1591): caption «خروج الحمم من فوهة البركان». The intro «هذا جبل كبير…» suggests that a volcano is just a big mountain. Only lava is mentioned, although V2 also animates steam or smoke puffs (1367).
- **Animations:** in both, lava fills the crater and flows down the slope, with smoke above (`ped_v1_s2_c_end.png`, `ped_v2_s2_c_end.png`). Add visible ash and small ejected rocks so that «موادّ بركانيّة» means more than lava.
- **Local misconception for the teacher:** Bahrain's Jebel Dukhan («جبل الدخان») is often taken for a volcano because of its name. It is not one.

### 2.3 Weathering (التجوية)
- **V1** (3610-3619): «تفتت الصخور إلى أجزاء أصغر.», with the note «محاكاة مسرّعة: يحدث هذا في الطبيعة ببطء خلال وقت طويل.». The definition is accurate and the slowness note is important, but «محاكاة مسرّعة» is not grade-3 vocabulary.
- **V2** (1592-1593): «الصخرة تتفتّت، وأجزاؤها تبقى قربها» and the chip «التجوية = تفتُّت». Good: it states the "stays in place" attribute explicitly.
- **Animation misconceptions in both:**
  1. **No cause is shown.** Nothing shows water, heat and cold, or plant roots acting on the rock. The rock simply breaks.
  2. **It looks sudden.** V2 shakes the rock (1408) and throws the fragments with an overshoot-and-hop curve (`backOut`, plus `sin(k·π)·0.15` in the y direction, 1410-1414). In V1, cracks and crumbling pieces arrive over 6.6 s with no time cue except the tag. Children may class weathering as a fast change, like an earthquake.
  3. **The fragments spread out.** In V2 they land up to about 1.3 m from the original spot (1394-1395). That is still "beside the rock", but the flying motion is the visual language of *transport*. Keep the pieces inside the rock's footprint: they should crack along lines and slump or slide down, not jump.
- **Fix:** show a time-lapse clock (day and night cycling, the sun and moon) with the label «نُسرِّعُ الزمن: سنواتٌ كثيرة». Show one or two agents: rain entering cracks, hot days and cool nights, a plant root widening a crack. End on «تبقى القِطَعُ في مكانها». Include water in this scene on purpose. It breaks the false rule "water means erosion".

### 2.4 Erosion (التعرية)
- **V1** (3622-3631): «انتقال التربة وفتات الصخور من مكان إلى آخر.». The board also compares the two: «التجوية = تفتت الصخور» and «التعرية = انتقال الفتات». Excellent; keep it.
- **V2** (1594-1595): «الماء ينقل التربة وفتات الصخور», the chip «التعرية = انتقال», and the in-scene signs «من هنا / إلى هنا» (1476). The best evidence design of the two.
- **Animations:** in both, a stream carries soil and rock bits from a pile at the top to a pile at the bottom; the source pile shrinks and the deposit pile grows (V2 1495-1496). Accurate.
- **Missing:** wind. Add a 3-second clip of wind blowing sand off a dune onto a path, with the line «والرياحُ أيضًا تنقلُ الرمال…». Many grade-3 texts name both water and wind. Check the student book, but wind is in any case the example Bahraini children see every day.
- **Bridge idea:** start the erosion station with *the same fragments* produced in the weathering station. The story becomes one rock: it **breaks and stays** (weathering), then **is carried away** (erosion). That is the most powerful way to teach the distinction.

### 2.5 Human changes (تغييرات الإنسان لسطح الأرض)
- **V1** (3634-3648): «يغيّر الإنسان سطح الأرض بالحفر والبناء وإنشاء الطرق.». Accurate and complete. The animation shows only levelling and a road (`ped_v1_s5_b_mid.png`, `ped_v1_s5_c_end.png`).
- **V2** (1596-1597, 1853): «سوّت الحفارة الأرض وأنشأت طريقًا». Here **the machine is the agent**, and the concept is that *people* change the land. «سوّت» is also a hard word for this age.
- **Fix:** people (workers) use the excavator. Show three actions: **dig** (a hole for foundations), **build** (a small house frame) and **pave** (a road). A Bahraini example for the board note is land reclamation from the sea, locally called «الدِّفان».

### 2.6 Fast or slow (cross-cutting)
Neither version says which changes are sudden. Add a chip to each board: «يحدثُ فجأةً» for the earthquake and volcano, «يحدثُ ببطء» for weathering and erosion (erosion can also be quick in a flood; keep that as a teacher note), and «من صُنعِ الإنسان» for human changes. These give children a second dimension for telling the five apart, and they cost nothing.

---

## 3. (b) Alignment with the objective (identify and distinguish)

- Both versions *present* all five phenomena. Neither makes the child **do** any distinguishing during the stations, apart from two practice items.
- V2's chips and V1's comparison board are the only explicit *contrast* moments. Both are tied to weathering and erosion.
- The quiz has one item per concept. That suits a short check, but the leaked captions (section 6) mean it does not measure the objective.
- **Recommendations:**
  1. Ask for a prediction before each station.
  2. Add an evidence hunt to every station, so the child has to locate the attribute that defines the phenomenon.
  3. Add a contrast line at the end of the erosion station.
  4. Before the challenge, add an optional, unscored sorting warm-up: «فجأةً أم ببطء؟» and «من الطبيعة أم من صنع الإنسان؟».
  5. Build the challenge so that each item's distractor is the phenomenon most easily confused with the target.

---

## 4. (c) Language: reading level, vocabulary, tashkeel, consistency, errors

### 4.1 Length and reading load
- Average string length is about 4 words in both (measured over the content blocks: V1 3586-3650, 5056-5212, 8555-8580; V2 1587-1618, 1650-1960).
- The outliers are V1's multi-line speeches. The welcome (5059-5064) is about 28 words in one bubble and the challenge intro (5076-5078) about 19 words. For VR and 8-year-olds, break them into turns of 12 words or fewer and voice each one.
- V2's help text for the headset (98: «وجّه شعاع وحدة التحكم واضغط الزناد…») uses adult vocabulary («وحدة التحكم»، «الزناد»). Keep it for teachers. The child version is in the script below.

### 4.2 Vocabulary that needs support
فُوَّهة، الحِمَم، القِشرة الأرضيّة، فُتات، تفتُّت، انتقال، مفاجئ، موادّ بركانيّة. Give each one a picture plus a short gloss the first time it appears.
Avoid: «محاكاة مسرّعة» (V1 3619), «سوّت» (V2 1597), «تمهّد» (both Q5), «ثوران» (both Q5; it is never taught), «تتدفّق» (V1 5131), «سنخوض» (V1 5063).

### 4.3 Tashkeel policy (recommended)
V2's partial tashkeel helps decoding (for example «شاهِد» is unambiguous; plain «شاهد» can be read as the noun "witness"). Rules for the new game:
1. **Shadda always** («تتفتّت، التحدّي، حفّارة، فُوَّهة»).
2. **Imperative sukun or kasra, and passive damma** where a verb could be misread («شاهِدْ، تُظهِرُ، يُمثِّلُ»).
3. **Tanween fatḥ** on accusative nouns («زلزالًا، طريقًا»).
4. **Full vowelling only for the five key terms and the new words** on the board title, the first time they appear: «الزِّلْزالُ، البُرْكانُ، التَّجْوِيَةُ، التَّعْرِيَةُ، الحُمَمُ، الفُوَّهَةُ، الفُتاتُ، القِشْرَةُ الأرْضِيَّةُ».
5. **No final vowel on second-person past verbs** («أحسنت، وجدت، ميّزت»), so that the same written text serves boys and girls. Only the recorded audio differs.

### 4.4 Term consistency (recommended choices)

| Concept | V1 | V2 | Use |
|---|---|---|---|
| Umbrella word | «الظاهرة» (help 8398, toast 9561), «التغيّر» (3613) | «المظهر» (1655, Q2 1611) | **«التغيُّر»** for children («ما اسمُ هذا التغيُّر؟»). Keep «مظاهر تغيُّر سطح الأرض» for the certificate and teacher text if the student book uses it |
| Weathering pieces | «أجزاء أصغر» (3615), «قطع صغيرة» (3613) | «قطع صغيرة» (1593), «أجزاء» (1592) | **«قِطَع»** everywhere (more concrete). Check the book: if the definition says «أجزاء», use «أجزاء» everywhere |
| Erosion verb | «ينقل / انتقال», «يحمل» (8574) | «ينقل / انتقال», «حمل» | **«ينقل / انتقال»** in definitions; «يحمل» only in narration |
| Lava | «الحمم» + «تتدفّق» | «الحمم» + «تخرج» | «الحِمَم» + «تخرجُ / تسيلُ» |
| Human changes | «تغييرات الإنسان» (button), «… لسطح الأرض» (title) | same | Same pattern. Note the grammar: «تغيُّر» (it changes by itself) for natural changes, «تغيير» (someone changes it) for human ones |
| Digits | Western (`المحطة 1 من 5`; CSV `ar-BH-u-nu-latn` 8683, 8688) | **Mixed**: hub «١ الزلزال» (1682), quiz «السؤال 1 من 5» (1901), results «من 5» (1942) | Use one system. Follow the student book (to verify). The script below uses ٠-٩ |

### 4.5 Grammar, spelling and style issues found

| Where | Text | Issue | Fix |
|---|---|---|---|
| V1 3601; V2 1590-1591, Q2 | «فوهة / فوهته» | Missing shadda; children may misread it | «فُوَّهة» |
| V1 5170, 5208; V2 1612, 1614, 1853 | «حفارة» | Missing shadda | «حفّارة» |
| V1 5126 and others | «أي صورة» | «أيّ» needs a shadda to be read as the question word | «أيُّ صورةٍ» |
| V1 3599-3606 | «تخرج منه مواد بركانية، ومنها الحمم.» | No subject when read or voiced alone | «البركانُ تخرجُ منه موادُّ بركانيّة، منها الحِمَم.» |
| V1 3590, 3601, 3624, 3647 vs 5081, 5099 | «انظروا… راقبوا… أحسنتم» vs «فكّر… يا صديقي» | Switches between plural and singular address | Singular, gender-aware (4.6) |
| V2 1588 | «اهتزاز الأرض وظهور شقوق» | Cracks are not always produced | Add «قد» and «مفاجئ» |
| V2 1597 | «سوّت الحفارة الأرض» | Machine as agent; hard verb | «حفرَ العمّالُ… ثم بنَوا طريقًا» |
| V2 1617; V1 5099 | «أحسنت يا بطل!» / «يا صديقي» | Masculine only | Gender-aware variants |
| V1 5109 | «لإكماله… وتمييزه» | Masculine only | «لإكمالها… وتمييزها» variant |
| V2 1889 | «هل أنت مستعد؟» | Masculine only | «هيّا نبدأ التحدّي!» (neutral) |
| V2 1942 | «حصلت على ${s} من 5» | Says a failing number aloud (0 or 1 is possible); mixes digits | Never voice a failing score; use stars |
| V1 5090-5094 | «الإجابة الصحيحة باللون الأخضر» | Colour-only cue; about 8% of boys are red-green colour-blind; no explanation | Explanation of the concept plus a ✓ shape |
| V1 3613 vs 3592/3605/3627/3640 | «شاهد التغيّر» vs «شاهد الزلزال، البركان، التعرية…» | Inconsistent: 4 of 5 watch buttons give away the name before observing | One neutral button: «هيّا نُشاهِد» |

No hard spelling errors were found (hamza, ta marbuta and alif maqsura are correct). The issues are missing shadda, ambiguity, register and gender.

### 4.6 Gender-aware address (new requirement)
Bahrain's public primary schools are single-sex, so a teacher setting **«مستكشف / مستكشفة»** is cheap and respectful. Rules:
- Prefer **first-person plural** with Ali («لِنَنظرْ، هيّا نختار، نُراجعُ معًا»). It is natural, warm and gender-neutral.
- Use written forms that are the same for both genders: past-tense verbs without a final vowel («أحسنت، وجدت»).
- Where an imperative or adjective is unavoidable, store two variants (m/f) and record two audio files.
- Ali stays a boy (he is in the title). The learner's badge and certificate follow the learner's gender.

---

## 5. (d) Feedback design and Ali's tone

- **Praise** is generic in both. Praise for the *act* is better than praise for the *person*: «وجدت الدليل!», «ميّزت الفرق!». V2 plays the "correct" sound merely for finishing an animation (1828), and V1 says «أحسنتم!» after the human-changes video (3647). That is praise for watching. Keep praise and the success sound for real actions (prediction made, evidence found, right answer).
- **Wrong answers:**
  - Never say «خطأ» and never use harsh red or a buzz sound. V1 shakes the card (4916); a soft dim is better.
  - Always (1) name the clue, (2) say what the chosen option actually shows, and (3) let the child find the correct answer, with no effect on the score.
- **Feedback per distractor** is better than one line per question, because each wrong choice reveals a different confusion (see the bank in section 9.5).
- **Results:**
  - On a fail, send the child to the station they actually missed («لِنُراجعْ معًا محطّةَ التعرية»). Neither version does this; V1 has the data (`kh`, `Oh`).
  - Show stars and «٣ من ٥». Show percentages only to the teacher; 60% means little to an 8-year-old.
- **Ali's persona:** a curious peer, not a teacher. He gives short turns (3-8 words), uses «نحن» (we), wonders out loud («تُرى… ماذا سيحدث؟»), stays calm in dramatic scenes («نحنُ نُشاهدُ من مكانٍ آمن»), and is always voiced. Both versions use browser speech synthesis (V1 1741-1797; V2 970-982). The Quest browser usually has **no Arabic voice**, so Ali goes silent for exactly the children who need audio most. **Record a human voice-over** (clear Modern Standard Arabic, child-friendly pace). Keep text bubbles as captions.

---

## 6. (e) Assessment design

### 6.1 Problems in the current challenge (identical in V1 and V2)
1. **The captions leak the answer.** The correct caption repeats the prompt or the definition (Q1 «…بسبب زلزال»; Q3 «تتفتّت وتبقى أجزاؤها قربها»; Q4 «ينقل التربة وفتات الصخور»).
2. **The images are identical to the station scenes.** This tests recognition, not transfer.
3. **Fixed option order** (ب، ج، أ، ب، ج). Retries become position memory.
4. **Q3 and Q4 mirror each other.** The weathering and erosion pictures appear together twice, so Q4 can be answered by eliminating Q3's answer.
5. **The distractors are weak.** Q2's options «التعرية / التجوية / البركان» for an obvious volcano picture test nothing. The most confusable pairs are never paired: earthquake with weathering (both have cracks), erosion with human change (both move soil), volcano with earthquake (both sudden, both from inside the Earth).
6. **Ali reads nothing on Q2-Q5 in V1** (9647-9651). This penalises weak readers in a *science* test.
7. **Accidental answers by gaze in V2.** The 1.6 s dwell (2047) can answer a question while the child is still reading, and the first answer locks.

### 6.2 What to keep
- **First answer counts** (V1 `yh` 8584-8596; V2 1914). Right for a check. Tell the child up front: «أوّلُ اختيارٍ هو الذي يُحسَب».
- **Pass mark ≥ 4/5 (80%)** (V1 `nm` 5122; V2 `PASS` 1618). Fine. With 3 options, the chance of reaching 4/5 by guessing is about 4.5%.
- **Unlimited retries**, every attempt logged.

### 6.3 New design
- **5 items, one per concept,** each with an **A form** (first try) and a **B form** (retry), so a retry is never identical. Shuffle option order on every attempt and re-letter أ/ب/ج in reading order.
- **Mixed formats:** "pick the picture" (picture options, prompt names the concept) and "name the picture" (one picture, word options).
- **New scenes, not station thumbnails.** Render separate quiz vignettes (desert rock with a root, a hill after rain, wind and sand, a fort wall, reclamation and building, a road with a crack, an island volcano).
- **Neutral captions** that name *objects*, never *processes*: «صخرةٌ قديمة» rather than «صخرة تتفتّت». Ali reads only the prompt.
- **Each distractor is the closest confusion,** with its own feedback line.
- **After a wrong answer:** feedback for that distractor, then the correct card glows, and the child must select it to continue (active correction, score unchanged).
- **In VR,** a scored answer needs a deliberate action (controller trigger or hand pinch). Gaze-only mode needs a 2.5 s dwell followed by a confirm pad.
- **Mastery flag for the teacher:** if Q3 or Q4 (weathering or erosion) is wrong, the dashboard marks «التمييز بين التجوية والتعرية لم يثبت بعد», even when the child passed.

### 6.4 Practice questions
- Keep them inside the station, right after the explanation, as in both versions.
- Use V1's retry-until-correct rule. After a wrong answer, replay the last 2 s of the animation and show a hint.
- Test the **defining attribute** (stays or moves), not the word. Do not put the definition in the prompt; V2's weathering practice prompt (1605) contains its own answer.

---

## 7. (f) Learning-flow proposal: predict, observe, explain, find the evidence, check

Each station takes about 90-120 s. Five stations take about 8-10 min and the challenge about 3 min, which fits one supervised VR session. Offer an optional break after station 3.

| Phase | What happens (VR) | Screen/tablet equivalent | Logged |
|---|---|---|---|
| **1. Predict** | Ali asks; two big picture-choice pads (unscored). Ali answers neutrally: «فكرةٌ جميلة! هيّا نُشاهِد.» | Two tappable cards | Choice |
| **2. Observe** | «هيّا نُشاهِد» button. Ali gives one attention cue («عيونُنا على الطريق!») and is then silent. Slow phenomena show the time-lapse chip. Replay is always available | Same | Replays |
| **3. Explain** | Board shows title, definition and note, plus a chip (fast/slow/human). Ali voices the definition. A gloss pops up for the new word | Same | — |
| **4. Find the evidence** | Ali: «أين الدليل؟». The child points the ray (or gaze, or a hand) at a hotspot. Hint 1 after 10 s or a miss; hint 2 makes the target glow; never blocking | Tap the hotspot | Tries, hints |
| **5. Check** | Weathering and erosion: a practice question. Others: the evidence hunt is the check. The phenomenon's card goes into «دفتر المستكشف» | Same | Tries |
| Close | Prediction loop-back: «توقُّعُك كان صحيحًا!» or «حدثَ شيءٌ مختلف! هكذا نتعلّم.». A bridge line to the next station | Same | — |

**Evidence hotspots:**
- Earthquake: *the crack in the road*.
- Volcano: *the flowing lava* (optional second target: the crater).
- Weathering: *the small pieces beside the rock*, then «هل ابتعدت؟».
- Erosion, two steps: *where the soil came from*, then *where it went* (reuse V2's «من هنا / إلى هنا» signs as reveal labels).
- Human changes: *something people made* (the road, the dug hole, the new wall).

**Interaction rules for 8-year-olds in VR:**
- Seated or standing still. Never move the camera during an animation.
- Fade between stations; 30° snap turns (keep V2's approach).
- Large targets: about 25 cm or more at 2 m.
- Keep everything inside about ±50° of straight ahead.
- Ali stands to one side and never blocks the evidence.
- Captions on a fixed board, not head-locked.
- No flashing; low rumble volume; a «تقليل الاهتزاز» (reduce shaking) toggle for the teacher.

**Navigation:** the first pass is in order and each station must be watched (V1 rules). After all five, the map is free for review and the challenge is unlocked. The hub greets on the first arrival (fix V2's `visitedHub` bug).

---

## 8. (g) Teacher tools and safety

### 8.1 Teacher dashboard (start from V1 `Uh` 8967-9120 and extend)
- **Access:** the teacher panel opens behind a simple gate (for example a long press plus a 2-digit sum) so children cannot clear records.
- **Per attempt:**
  - Student number (optional, 1-40; never a name) and learner gender setting.
  - Mode (VR or screen), start and end time, time per station.
  - Predictions; replays; evidence tries and hints used; practice tries (already in V1); first answer per quiz item and the concept chosen.
  - Form (A or B), option order, score, pass, and the weathering/erosion mastery flag.
- **Class views:**
  - Errors per concept (V1 `Oh` 8661-8667).
  - **Confusion matrix** (target concept against chosen concept, from V1 `kh` 8668-8674). The «تجوية ↔ تعرية» cell is the key number.
  - Who still needs which station.
- **Export:** CSV with a UTF-8 BOM (V1 `Mh` 8697-8740 already does this; keep its Arabic headers) plus print. Data stays on the device; state this in the panel (V1 9038).
- **Controls:** «طالبٌ جديد» (new student: resets progress, keeps the log), session length timer, sound and voice toggles, reduce-shaking toggle, learner gender.

### 8.2 Certificate
Keep V1's canvas certificate: optional typed name, not stored (8504-8522); score, stars and date (8840-8895). Add gendered text, five concept badges and a line for the teacher's signature. Final wording is in section 9.8.

### 8.3 VR safety with 8-9-year-olds (teacher-facing; the Arabic is in section 9.10)
- **Age:** Meta's minimum age for Quest is 10+ (V1 already says so, 8463), and the class is 8-9. VR use must follow school and Ministry policy and parental consent. The game must teach **the whole lesson in screen or tablet mode**. Recommended class model: one headset rotation station, the rest of the class on tablets in screen mode, or the teacher casts the headset to the classroom screen.
- **Session:** 10 minutes or less per child for under-10s (both versions say 10-15). The built-in break reminder appears at about 8 minutes, at a station boundary.
- **Posture:** seated on a chair without wheels, 1.5 m clear around, stationary boundary, one adult per headset.
- **Fit:** Quest 2 lenses only go down to 58 mm IPD, wider than most children's eyes. Use the smallest setting, tighten the strap, and stop at any eye strain. The headset weighs about 500 g, another reason for short sessions.
- **Hygiene:** wipe the face interface and controllers between children; use a washable silicone cover.
- **Stop signs:** dizziness, nausea, headache, eye strain, fear. The child takes the headset off at once and continues in screen mode. Progress is kept.
- **Content:** no camera shake, no collapse or injury, calm volcano audio, a reassurance line from Ali, no flashing lights.

---

## 9. FINAL RECOMMENDED ARABIC SCRIPT

Conventions:
- **[علي]** marks a line Ali speaks (recorded audio, shown as a caption). **[لوحة]** is board text, **[زر]** a button, **[نظام]** a system message.
- **م / ؤ** give the masculine and feminine forms of a line, used only where they differ (learner-gender setting). Lines without a ؤ form are written to suit both.
- Tashkeel follows section 4.3. Digits use ٠-٩ (switch if the student book uses 0-9).
- Every child-facing line is 12 words or fewer. The number of words is in brackets where useful.
- Button labels use the gender-neutral «نحن» (we) form.

### 9.1 Welcome, navigation and buttons

| ID | Who | Text (م) | ؤ variant |
|---|---|---|---|
| W1 | [علي] | مرحبًا! أنا علي، المستكشفُ الصغير. | — |
| W2 | [علي] | أرضُنا تتغيّر… هيّا نكتشفُ كيف! | — |
| W3 | [علي] | سنزورُ خمسَ محطّات، ثمّ نلعبُ في قاعةِ التحدّي. | — |
| W4-VR | [علي] | وجِّهِ الشعاعَ إلى الزرّ، ثمّ اضغطْ بإصبعِك. | وجِّهي الشعاعَ إلى الزرّ، ثمّ اضغطي بإصبعِك. |
| W4-screen | [علي] | المسِ الزرَّ لتختار. | المسي الزرَّ لتختاري. |
| W5 | [علي] | نحنُ نُشاهِدُ من مكانٍ آمن. هيّا نبدأ! | — |
| WB | [علي] (return visit) | أهلًا بعودتك! هيّا نُكمِلُ رحلتَنا. | — |
| HUB | [علي] (review hub) | اختَرْ محطّةً لنُراجعَها، أو ادخلْ قاعةَ التحدّي. | اختاري محطّةً لنُراجعَها، أو ادخلي قاعةَ التحدّي. |
| LOCK | [نظام] | نُكمِلُ هذه المحطّةَ أوّلًا. | — |
| LOCK-H | [نظام] | نزورُ المحطّاتِ الخمسَ أوّلًا، ثمّ نفتحُ قاعةَ التحدّي. | — |
| B-start | [زر] | هيّا نبدأُ الرحلة | — |
| B-watch | [زر] | هيّا نُشاهِد | — |
| B-replay | [زر] | نُشاهِدُ مرّةً أخرى | — |
| B-listen | [زر] | نسمعُ مرّةً أخرى | — |
| B-next / B-prev / B-map | [زر] | التالي / السابق / الخريطة | — |
| B-hall | [زر] | إلى قاعةِ التحدّي | — |
| KICK | [لوحة] | المحطّةُ ١ من ٥ (and so on) | — |
| PRE-BOARD | [لوحة] (before watching) | ماذا سيحدث؟ | — |
| PRED-ACK | [علي] (after any prediction) | فكرةٌ جميلة! هيّا نُشاهِد. | — |
| PRED-YES | [علي] (prediction matched) | توقُّعُك كان صحيحًا! | — |
| PRED-NO | [علي] (prediction not matched) | حدثَ شيءٌ مختلف! هكذا نتعلّمُ بالمشاهدة. | — |
| NOTEBOOK | [علي] (card earned) | بطاقةٌ جديدةٌ في دفترِ المستكشف! | — |

### 9.2 Station 1: Earthquake (الزِّلْزال)

| ID | Who | Text (م) | ؤ variant |
|---|---|---|---|
| S1-intro | [علي] | هنا طريقٌ وبيوت. الأرضُ تبدو ثابتة. | — |
| S1-predict | [علي] + [لوحة] | هل تبقى الأرضُ ثابتةً دائمًا؟ | — |
| S1-choices | [زر] | «تبقى ثابتة» / «قد تهتزّ» | — |
| S1-cue | [علي] (as play starts) | عيونُنا على الطريق! | — |
| S1-observe | [علي] | اهتزّت الأرضُ فجأةً، وظهرت شقوقٌ في الطريق! | — |
| S1-title | [لوحة] | الزِّلْزالُ | — |
| S1-def | [لوحة] | اهتزازٌ مفاجئٌ في القِشْرَةِ الأرْضِيَّة. | — |
| S1-note | [لوحة] | قد تظهرُ بعدَه شقوقٌ في الأرض. | — |
| S1-chip | [لوحة] | (lightning icon) يحدثُ فجأةً | — |
| S1-explain | [علي] | هذا هو الزلزال: اهتزازٌ مفاجئٌ في القشرةِ الأرضيّة. | — |
| S1-gloss | [علي] (tap on «القشرة الأرضيّة») | القشرةُ الأرضيّة: الطبقةُ التي نعيشُ عليها. | — |
| S1-evid | [علي] | أين الدليل؟ أشِرْ إلى شَقٍّ في الطريق. | أين الدليل؟ أشيري إلى شَقٍّ في الطريق. |
| S1-ok | [علي] | وجدته! هذا شَقٌّ سبّبه الزلزال. | — |
| S1-hint1 | [علي] | لِننظرْ إلى الطريق… أين الخطُّ المتعرّج؟ | — |
| S1-hint2 | [علي] + target glows | هنا! الشَّقُّ يلمع. | — |
| S1-bridge | [علي] | الزلزالُ يحدثُ فجأة. هل يوجدُ تغيُّرٌ آخرُ سريع؟ | — |

### 9.3 Station 2: Volcano (البُرْكان)

| ID | Who | Text (م) | ؤ variant |
|---|---|---|---|
| S2-intro | [علي] | هذا جبلٌ في قمّتِه فتحةٌ اسمُها الفُوَّهة. | — |
| S2-predict | [علي] + [لوحة] | ماذا سيخرجُ من الفُوَّهة؟ | — |
| S2-choices | [زر] (pictures) | «ماءٌ بارد» / «موادُّ ساخنة» | — |
| S2-cue | [علي] | عيونُنا على الفُوَّهة! | — |
| S2-observe | [علي] | خرجت من الفُوَّهةِ حِمَمٌ ساخنة، ودخانٌ ورماد! | — |
| S2-title | [لوحة] | البُرْكانُ | — |
| S2-def | [لوحة] | تخرجُ منه موادُّ بركانيّة، منها الحِمَم. | — |
| S2-note | [لوحة] | الحِمَم: صخورٌ ذابت من شدّةِ الحرارة. | — |
| S2-chip | [لوحة] | (lightning icon) يحدثُ بسرعة | — |
| S2-explain | [علي] | البركانُ تخرجُ منه موادُّ بركانيّة، منها الحِمَم. | — |
| S2-evid | [علي] | أين الحِمَم؟ أشِرْ إليها وهي تسيل. | أين الحِمَم؟ أشيري إليها وهي تسيل. |
| S2-ok | [علي] | صحيح! هذه حِمَمٌ خرجت من البركان. | — |
| S2-hint1 | [علي] | لِنبحثْ عن اللونِ البرتقاليِّ على الجبل. | — |
| S2-hint2 | [علي] + glow | هنا! الحِمَمُ تلمع. | — |
| S2-bridge | [علي] | الآن تغيُّرٌ بطيءٌ جدًّا… هيّا نرى! | — |

### 9.4 Station 3: Weathering (التَّجْوِيَة)

| ID | Who | Text (م) | ؤ variant |
|---|---|---|---|
| S3-intro | [علي] | هذه صخرةٌ كبيرة. سنُسرِّعُ الزمنَ كثيرًا! | — |
| S3-predict | [علي] + [لوحة] | ماذا سيحدثُ للصخرةِ بعدَ سنواتٍ كثيرة؟ | — |
| S3-choices | [زر] | «تتفتّتُ إلى قِطَع» / «تبقى كما هي» | — |
| S3-cue | [علي] | عيونُنا على الصخرة! | — |
| S3-timechip | [لوحة] (during play) | (fast-forward clock icon) نُسرِّعُ الزمن: سنواتٌ كثيرة | — |
| S3-observe | [علي] | تفتّتت الصخرةُ إلى قِطَعٍ صغيرة، وبقيت القِطَعُ في مكانها. | — |
| S3-agents | [علي] | الماءُ والحرارةُ وجذورُ النباتاتِ تُفتِّتُ الصخورَ ببطء. | — |
| S3-title | [لوحة] | التَّجْوِيَةُ | — |
| S3-def | [لوحة] | تفتُّتُ الصخورِ إلى قِطَعٍ أصغر. | — |
| S3-note | [لوحة] | تبقى القِطَعُ في مكانِها، ويحدثُ ذلك ببطء. | — |
| S3-chip | [لوحة] | التجوية = تفتُّت / (tortoise icon) تحدثُ ببطء | — |
| S3-explain | [علي] | هذه هي التجوية: تفتُّتُ الصخورِ إلى قِطَعٍ أصغر. | — |
| S3-evid | [علي] | أين ذهبت القِطَعُ الصغيرة؟ أشِرْ إليها. | أين ذهبت القِطَعُ الصغيرة؟ أشيري إليها. |
| S3-evid2 | [علي] (after the hit) | هل ابتعدت عن الصخرة؟ | — |
| S3-ok | [علي] | أحسنت! القِطَعُ بقيت بجانبِ الصخرة. هذه تجوية. | — |
| S3-hint1 | [علي] | لِننظرْ تحتَ الصخرةِ وحولَها. | — |
| S3-hint2 | [علي] + glow | هنا! القِطَعُ بجانبِ الصخرة. | — |
| S3-bridge | [علي] | القِطَعُ بقيت مكانَها… فهل تبقى دائمًا؟ لِنَرَ! | — |

**Practice 1 (weathering), straight after S3-ok:**

| ID | Who | Text |
|---|---|---|
| P-intro | [علي] | سؤالٌ سريعٌ قبلَ أن نُكمِل! |
| P-tag | [لوحة] | سؤالٌ تدريبيّ |
| P1-q | [علي] + [لوحة] | أين ذهبت قِطَعُ الصخرة؟ |
| P1-a ✓ | card (picture: pieces at the foot of the same rock) | بقيت بجانبِ الصخرة |
| P1-b | card (picture: pieces in a stream far away) | حملَها الماءُ بعيدًا |
| P1-ok | [علي] | صحيح! بقيت في مكانِها. هذه تجوية. |
| P1-retry | [علي] (replay the last 2 s, then choose again) | لِننظرْ مرّةً أخرى: هل ابتعدت القِطَعُ عن الصخرة؟ |

### 9.5 Station 4: Erosion (التَّعْرِيَة)

| ID | Who | Text (م) | ؤ variant |
|---|---|---|---|
| S4-intro | [علي] | فوقَ التلِّ تربةٌ وفُتاتُ صخور. | — |
| S4-gloss | [علي] | الفُتات: قِطَعٌ صغيرةٌ جدًّا من الصخور. | — |
| S4-predict | [علي] + [لوحة] | سيجري الماء. ماذا سيحدثُ للتربةِ والفُتات؟ | — |
| S4-choices | [زر] | «تنتقلُ مع الماء» / «تبقى مكانَها» | — |
| S4-cue | [علي] | عيونُنا على الماء! | — |
| S4-observe | [علي] | حملَ الماءُ التربةَ والفُتاتَ إلى مكانٍ آخر! | — |
| S4-wind | [علي] (3-s wind and sand clip) | والرياحُ أيضًا تنقلُ الرمالَ من مكانٍ إلى آخر. | — |
| S4-title | [لوحة] | التَّعْرِيَةُ | — |
| S4-def | [لوحة] | انتقالُ التربةِ وفُتاتِ الصخورِ من مكانٍ إلى آخر. | — |
| S4-note | [لوحة] | ينقلُها الماءُ الجاري أو الرياح. | — |
| S4-chip | [لوحة] | التعرية = انتقال | — |
| S4-compare | [لوحة] (two pictures) | التجوية: تتفتّتُ وتبقى / التعرية: ينتقلُ الفُتات | — |
| S4-explain | [علي] | هذه هي التعرية: انتقالُ التربةِ والفُتاتِ إلى مكانٍ آخر. | — |
| S4-contrast | [علي] | في التجويةِ تتفتّتُ الصخرة، وفي التعريةِ ينتقلُ الفُتات. | — |
| S4-evid1 | [علي] | من أينَ بدأ الفُتات؟ أشِرْ إلى المكان. | من أينَ بدأ الفُتات؟ أشيري إلى المكان. |
| S4-evid2 | [علي] | وأينَ وصل؟ أشِرْ إلى المكانِ الجديد. | وأينَ وصل؟ أشيري إلى المكانِ الجديد. |
| S4-ok | [علي] (signs «من هنا / إلى هنا» appear) | رائع! انتقلَ الفُتاتُ من هنا إلى هناك. هذه تعرية. | — |
| S4-hint1 | [علي] | لِنتبعْ مجرى الماءِ حتّى نهايتِه. | — |
| S4-hint2 | [علي] + glow | هنا! كومةُ التربةِ الجديدة. | — |

**Practice 2 (erosion), straight after S4-ok:**

| ID | Who | Text |
|---|---|---|
| P2-q | [علي] + [لوحة] | أيُّ صورةٍ تُظهِرُ التعرية؟ |
| P2-a | card (picture: a cracked rock with its pieces beside it, no running water) | صخرةٌ وقِطَعُها |
| P2-b ✓ | card (picture: rainwater carrying brown soil down a slope to a pile at the bottom) | تلٌّ وماءٌ جارٍ |
| P2-ok | [علي] | رائع! الماءُ نقلَ التربةَ إلى مكانٍ آخر. هذه تعرية. |
| P2-retry | [علي] | هنا بقيت القِطَعُ مكانَها: تجوية. لِنبحثْ عمّا انتقل. |

### 9.6 Station 5: Human changes (تغييراتُ الإنسانِ لسطحِ الأرض)

| ID | Who | Text (م) | ؤ variant |
|---|---|---|---|
| S5-intro | [علي] | أرضٌ فيها تلالٌ وصخور. جاءَ العمّالُ بالحفّارة. | — |
| S5-predict | [علي] + [لوحة] | هل يستطيعُ الإنسانُ تغييرَ سطحِ الأرض؟ | — |
| S5-choices | [زر] | «نعم» / «لا» | — |
| S5-cue | [علي] | عيونُنا على التلال! | — |
| S5-observe | [علي] | حفرَ العمّالُ وأزالوا التلال، ثمّ بنَوا طريقًا جديدًا! | — |
| S5-title | [لوحة] | تغييراتُ الإنسانِ لسطحِ الأرض | — |
| S5-def | [لوحة] | يغيّرُ الإنسانُ سطحَ الأرضِ بالحفرِ والبناءِ وإنشاءِ الطُّرُق. | — |
| S5-note | [لوحة] | في البحرين: يُردَمُ البحرُ لبناءِ أراضٍ جديدة. | — |
| S5-chip | [لوحة] | (worker icon) من صُنعِ الإنسان | — |
| S5-explain | [علي] | الإنسانُ يغيّرُ سطحَ الأرضِ بالحفرِ والبناءِ وإنشاءِ الطُّرُق. | — |
| S5-before / S5-after | [زر] | قبلَ العمل / بعدَ العمل | — |
| S5-before-line | [علي] | قبلَ العمل: تلالٌ وصخور. | — |
| S5-after-line | [علي] | بعدَ العمل: أرضٌ مستويةٌ وطريقٌ جديد. | — |
| S5-evid | [علي] | أشِرْ إلى شيءٍ صنعَه الإنسان. | أشيري إلى شيءٍ صنعَه الإنسان. |
| S5-ok | [علي] | نعم! الإنسانُ صنعَ الطريق، فتغيّرَ سطحُ الأرض. | — |
| S5-hint1 | [علي] | لِنبحثْ عن الطريقِ الجديدِ أو الحفرة. | — |
| S5-hint2 | [علي] + glow | هنا! الطريقُ الجديد. | — |
| S5-end | [علي] | زرنا المحطّاتِ الخمس! هيّا إلى قاعةِ التحدّي. | — |

**Optional sorting warm-up (unscored, before the challenge):** [علي] «لِنضعْ كلَّ بطاقةٍ في مكانِها: فجأةً أم ببطء؟». The bins are labelled «فجأةً» and «ببطء». A second round sorts by «من الطبيعة» / «من صُنعِ الإنسان».

### 9.7 Challenge hall (قاعة التحدّي)

| ID | Who | Text (م) | ؤ variant |
|---|---|---|---|
| H-intro1 | [علي] | مرحبًا بك في قاعةِ التحدّي! | — |
| H-intro2 | [علي] | خمسةُ أسئلةٍ مصوَّرة. لِننظرْ إلى الصورِ جيّدًا. | — |
| H-rule | [علي] + [لوحة] | أوّلُ اختيارٍ هو الذي يُحسَب، فلا نستعجل. | — |
| H-go | [زر] | هيّا نبدأُ التحدّي | — |
| H-count | [لوحة] | السؤالُ ٢ من ٥ | — |
| H-fix | [علي] (after any wrong answer, once the feedback has played) | اخترِ الصورةَ التي تلمع لنُكمِل. | اختاري الصورةَ التي تلمع لنُكمِل. |
| H-next | [زر] | السؤالُ التالي / نتيجتي | — |

**Challenge bank.** Each item has an **A** form (first attempt) and a **B** form (retry). Shuffle options on every attempt. Captions under pictures name objects only. Ali reads only the prompt. The "picture" column describes a new scene to render (not the station thumbnail).

**Q1: Earthquake.** A form: pick the picture.
- Prompt [علي]: «أيُّ صورةٍ تُظهِرُ زلزالًا؟»

| Option | Picture to render | Caption | Feedback if chosen [علي] |
|---|---|---|---|
| ✓ | Schoolyard and street: a fresh zigzag crack across the paving, a tilted lamp post, shake lines around a swing; no people | ساحةٌ وطريق | (praise variant) |
| ✗ weathering | An old desert rock with cracks and small pieces at its foot | صخرةٌ قديمة | هذه صخرةٌ تفتّتت ببطء: تجوية. الزلزالُ اهتزازٌ مفاجئ. |
| ✗ human | An excavator digging a hole for a house foundation | حفّارةٌ وحفرة | هذه حفرةٌ حفرَها الإنسان. الزلزالُ يهزُّ الأرضَ فجأة. |

Clue line, shown with the correct card: «الدليل: الأرضُ اهتزّت فجأةً، وظهرَ شَقّ.»
**Q1 B form:** name the picture. Picture: a road with a long crack and small stones fallen from a wall, with shake lines. Prompt «ما اسمُ هذا التغيُّر؟». Options: الزلزال ✓ / التجوية / البركان. If التجوية is chosen: «هنا اهتزّت الأرضُ فجأة. هذا زلزال.» If البركان: «لا حِمَمَ هنا. الأرضُ اهتزّت: زلزال.»

**Q2: Volcano.** A form: name the picture.
- Picture: a mountain on an island; an ash cloud rises from the crater and orange lava runs towards the sea.
- Prompt [علي]: «ما اسمُ هذا التغيُّر؟»

| Option | Feedback if chosen [علي] |
|---|---|
| البركان ✓ | (praise) |
| الزلزال | في الزلزالِ تهتزُّ الأرض. هنا حِمَمٌ من فُوَّهة: بركان. |
| التعرية | التعريةُ ينقلُ فيها الماءُ التربة. هنا حِمَم: بركان. |

Clue: «الدليل: حِمَمٌ ورمادٌ تخرجُ من الفُوَّهة.»
**Q2 B form:** pick the picture. Prompt «أيُّ صورةٍ تُظهِرُ بركانًا؟». Options:
- ✓ a volcano at dusk with glowing lava, caption «جبلٌ وفُوَّهة»;
- a mountain stream carrying stones (erosion), caption «جبلٌ وماء». Feedback: «هنا ماءٌ ينقلُ الحجارة: تعرية. البركانُ تخرجُ منه حِمَم.»
- a cracked road (earthquake), caption «طريقٌ وبيوت». Feedback: «هذا شقٌّ من زلزال. البركانُ تخرجُ منه حِمَم.»

**Q3: Weathering.** A form: name the picture.
- Picture: a big rock with a small shrub growing in its crack and fallen pieces lying directly beneath it; dry ground, no running water.
- Prompt [علي]: «ما اسمُ هذا التغيُّر؟»

| Option | Feedback if chosen [علي] |
|---|---|
| التجوية ✓ | (praise) |
| التعرية | القِطَعُ لم تنتقل، بقيت بجانبِ الصخرة. هذه تجوية. |
| الزلزال | لا اهتزازَ هنا. الصخرةُ تفتّتت ببطء: تجوية. |

Clue: «الدليل: الصخرةُ تفتّتت، وقِطَعُها بقيت مكانَها.»
**Q3 B form:** pick the picture. Prompt «أيُّ صورةٍ تُظهِرُ التجوية؟». Options:
- ✓ an old fort wall crumbling with bits at its base, caption «جدارٌ قديم»;
- wind blowing sand from a dune onto a road (erosion), caption «رمالٌ وطريق». Feedback: «الرياحُ نقلت الرمال: تعرية. في التجويةِ تبقى القِطَعُ مكانَها.»
- a human digging (human change), caption «عمّالٌ وحفرة». Feedback: «هذه حفرةٌ من صُنعِ الإنسان. التجويةُ تحدثُ ببطءٍ في الطبيعة.»

**Q4: Erosion.** A form: pick the picture.
- Prompt [علي]: «في أيِّ صورةٍ تحدثُ التعرية؟»

| Option | Picture to render | Caption | Feedback if chosen [علي] |
|---|---|---|---|
| ✓ | After rain: brown water running down a hill, carrying soil to a pile at the bottom | تلٌّ بعدَ المطر | (praise) |
| ✗ weathering | A cracked rock with its pieces right beside it | صخرةٌ وقِطَعُها | القِطَعُ هنا بقيت مكانَها: تجوية. التعريةُ فيها انتقال. |
| ✗ human | An excavator loading soil into a truck | حفّارةٌ وشاحنة | الإنسانُ نقلَ الترابَ بالحفّارة. في التعريةِ ينقلُه الماءُ أو الرياح. |

Clue: «الدليل: الماءُ حملَ التربةَ إلى مكانٍ آخر.»
**Q4 B form:** name the picture. Picture: strong wind moving sand from a dune across a road. Prompt «ما اسمُ هذا التغيُّر؟». Options: التعرية ✓ / التجوية / تغييراتُ الإنسان. If التجوية: «لا صخرةَ تتفتّتُ هنا. الرياحُ نقلت الرمال: تعرية.» If تغييرات الإنسان: «الإنسانُ لم يفعلْ هذا. الرياحُ نقلت الرمال: تعرية.»

**Q5: Human changes.** A form: pick the picture.
- Prompt [علي]: «أيُّ صورةٍ تُظهِرُ تغييرًا صنعَه الإنسان؟»

| Option | Picture to render | Caption | Feedback if chosen [علي] |
|---|---|---|---|
| ✓ | Workers and machines filling the sea edge and building a road and new houses on the new land | عمّالٌ وآلات | (praise) |
| ✗ volcano | A volcano with lava | جبلٌ وفُوَّهة | البركانُ من الطبيعة، لم يصنعْه الإنسان. |
| ✗ erosion | Wind carrying desert sand | رمالٌ ورياح | الرياحُ نقلت الرمال: تعرية، وليست من صُنعِ الإنسان. |

Clue: «الدليل: الإنسانُ يحفرُ ويبني ويُنشئُ الطُّرُق.»
**Q5 B form:** name the picture. Picture: new houses being built next to a big foundation hole, with a crane. Prompt «ما اسمُ هذا التغيُّر؟». Options: تغييراتُ الإنسانِ لسطحِ الأرض ✓ / الزلزال / التجوية. If الزلزال: «هذه حفرةٌ حفرَها العمّال، لا شقٌّ من زلزال.» If التجوية: «هنا بناءٌ وحفر: من صُنعِ الإنسان.»

**Scoring rules:** the first selection per item counts. Pass is ≥ 4/5. The teacher sees the weathering/erosion mastery flag when Q3 or Q4 is wrong. Every attempt is logged with its form and option order.

### 9.8 Praise and encouraging-retry variants (all [علي], gender-neutral in writing)

**Praise (rotate them):**
1. أحسنت! إجابةٌ صحيحة.
2. رائع! وجدت الدليل!
3. ممتاز! ميّزت الفرقَ جيّدًا.
4. صحيح! هذا تفكيرُ العلماء!
5. إجابةٌ ذكيّة! نجمةٌ جديدةٌ لك.
6. أحسنت! عيناك تريان التفاصيل.

**Encouraging retry (rotate them; always followed by the item's specific feedback):**
1. لا بأس، الخطأُ يُعلّمُنا. لِننظرْ معًا.
2. اقتربت! لِنبحثْ عن الدليلِ مرّةً أخرى.
3. فكرةٌ جيّدة، لكن لِننظرْ إلى الصورةِ جيّدًا.
4. العلماءُ أيضًا يُحاولونَ مرّاتٍ كثيرة.
5. لا بأس! هيّا نتعلّمُ من هذه الصورة.

Never used: «خطأ»، «للأسف»، «إجابة خاطئة» in child view, a buzzer, red flashing, a shaking card.

### 9.9 Results

| ID | Who | Text (م) | ؤ variant |
|---|---|---|---|
| R-title | [لوحة] | نتيجةُ مغامرتك | — |
| R-stars | [لوحة] | (5 stars filled by the score) and «٤ من ٥» | — |
| R-pass-board | [لوحة] | أحسنت! حقّقت هدفَ المغامرة. | — |
| R-pass-ali | [علي] | رائع! أنت الآن مستكشفٌ ماهر! | رائع! أنتِ الآن مستكشفةٌ ماهرة! |
| R-perfect | [علي] (5/5) | خمسُ نجوم! ميّزت التغيّراتِ الخمسةَ كلَّها! | — |
| R-badge | [علي] | هذه شارتُك وشهادتُك. مبروك! | — |
| R-fail-board | [لوحة] | محاولةٌ جميلة! لِنُراجعْ، ثمّ نحاولُ مجدّدًا. | — |
| R-fail-ali | [علي] (targeted) | لِنُراجعْ معًا محطّةَ {اسم المحطة}، ثمّ نعودُ للتحدّي. | — |
| R-fail-ali-2 | [علي] (two or more missed) | لِنُراجعْ معًا: {محطة١} و{محطة٢}. | — |
| R-fail-ali-3 | [علي] | التعلُّمُ رحلة، والمحاولةُ القادمةُ أجمل! | — |
| R-btn | [زر] | نُراجعُ المحطّات / نُعيدُ التحدّي / شهادتي | — |

Rules: never voice a failing number. Show stars and «٣ من ٥» on the board only (no percent in the child view). The review button takes the child straight to the first missed station.

### 9.10 Certificate

| Element | م | ؤ |
|---|---|---|
| Title | شهادةُ المستكشفِ الصغير | شهادةُ المستكشفةِ الصغيرة |
| Line 1 | تُمنَحُ هذه الشهادةُ إلى: | (same) |
| Name | (optional, typed, never stored) or the default «المستكشفُ الصغير» | default «المستكشفةُ الصغيرة» |
| Body | لأنّه أكملَ مغامرةَ «الأرضُ تتغيّر»، وميّزَ مظاهرَ تغيُّرِ سطحِ الأرض. | لأنّها أكملت مغامرةَ «الأرضُ تتغيّر»، وميّزت مظاهرَ تغيُّرِ سطحِ الأرض. |
| Badges row | الزلزال • البركان • التجوية • التعرية • تغييرات الإنسان | (same) |
| Score | النتيجة: ٤ من ٥ (plus stars) | (same) |
| Footer | العلوم — الصفُّ الثالثُ الابتدائيّ — درس «الأرضُ تتغيّر» | (same) |
| Signatures | المستكشفُ علي / توقيعُ المعلّم: ________ | توقيعُ المعلّمة: ________ |
| Date | التاريخ: ٢٣ / ١٠ / ٢٠٢٦ (format example) | (same) |

### 9.11 Break and comfort lines

| ID | Who | Text (م) | ؤ variant |
|---|---|---|---|
| BRK-1 | [علي] (about 8 min, at a station boundary) | وقتُ الاستراحة! لِنُرِحْ عيونَنا قليلًا. | — |
| BRK-2 | [علي] | ضَعِ النظّارةَ بهدوء، وأخبِرْ معلّمَك. | ضَعي النظّارةَ بهدوء، وأخبري معلّمتَك. |
| CMF-1 | [علي] (at VR start, and in the pause menu) | إذا شعرت بدوارٍ أو تعب، أخبِرْ معلّمَك فورًا. | إذا شعرت بدوارٍ أو تعب، أخبري معلّمتَك فورًا. |
| CMF-2 | [علي] (volcano and earthquake intros, optional) | لا تقلق، نحنُ نُشاهِدُ من مكانٍ آمن. | لا تقلقي، نحنُ نُشاهِدُ من مكانٍ آمن. |
| END-VR | [علي] | انتهت جولتُنا بالنظّارة. نُكمِلُ على الشاشة! | — |
| RESUME | [علي] | أهلًا بعودتك! نُكمِلُ من حيثُ توقّفنا. | — |

### 9.12 Teacher-facing notes (Arabic, for the teacher panel and start-screen «للمعلّم»)

**هدف الدرس:** أن يتعرّف الطالب خمسةَ مظاهر لتغيُّر سطح الأرض (الزلزال، البركان، التجوية، التعرية، تغييرات الإنسان)، وأن يميّز بينها، وخاصّةً بين التجوية والتعرية.

**المفاهيم الخاطئة الشائعة وكيف تعالجها المغامرة:**
- «التجوية والتعرية شيءٌ واحد»: محطّة التعرية تبدأ بقِطَع صخرة التجوية نفسها. ركّز على السؤال: «هل بقيت القِطَع في مكانها أم انتقلت؟»
- «كلُّ ما فيه ماءٌ تعرية»: في مشهد التجوية يظهر الماء أيضًا، وفي التعرية تظهر الرياح أيضًا.
- «التجوية تحدث بسرعة»: المشهد مُسرَّع، ومكتوب عليه «سنوات كثيرة».
- «كلُّ زلزالٍ يشقُّ الأرض»: التعريف يقول «قد تظهر شقوق».
- «البركان أيُّ جبلٍ كبير»: البركان تخرج منه موادّ بركانيّة. وجبل الدخان في البحرين ليس بركانًا.
- «الآلة هي التي تغيّر الأرض»: الإنسان يستخدم الآلة. التعريف: «بالحفر والبناء وإنشاء الطرق».

**أسئلة للنقاش بعد الجولة:**
- ماذا حدث لقِطَع الصخرة في التجوية؟ وماذا حدث للفُتات في التعرية؟
- أيُّ التغيّرات حدث فجأةً؟ وأيُّها ببطء؟
- اذكرْ تغييرًا صنعه الإنسان في البحرين.

**قراءة لوحة المعلّم:**
- عمود «المفهوم المختار» يبيّن نوع الخلط. مثلًا «اختار التجوية بدل التعرية» يعني أنّ التمييز بين التفتُّت والانتقال يحتاج إلى مراجعة.
- علامة «التمييز بين التجوية والتعرية لم يثبت بعد» تظهر حتّى لو نجح الطالب.
- محاولات التدريب والتلميحات المستخدمة تدلّ على الحاجة إلى دعم.

**الخصوصيّة:** لا تُحفظ الأسماء. تُستخدم أرقام الطلاب فقط، وتبقى البيانات على هذا الجهاز. صدِّرْ ملف CSV قبل مسح السجلّ.

**السلامة مع النظّارة (للأطفال ٨–٩ سنوات):**
- تحدّد الشركة المصنّعة لنظارة Meta Quest عمرًا أدنى هو ١٠ سنوات. لذلك يكون الاستخدام وفق سياسة المدرسة والوزارة وبموافقة وليّ الأمر.
- وضعُ الشاشة يقدّم الدرس كاملًا، وهو البديل المتكافئ.
- مدّة الجلسة ١٠ دقائق أو أقلّ، مع استراحة.
- يجلس الطالب على كرسيٍّ ثابت، في مساحةٍ خالية، مع إشراف بالغٍ لكلّ نظّارة.
- اضبطْ مسافة العدسات على أصغر وضع، وثبّتِ الحزام.
- نظّفْ واجهة الوجه ووحدات التحكّم بين كلِّ طالبٍ وآخر.
- عند الدوار أو الصداع أو إجهاد العين أو الخوف: يخلع الطالب النظّارة فورًا، ويكمل على الشاشة. لا يضيع تقدّمه.
- يمكن تفعيل «تقليل الاهتزاز» من لوحة المعلّم.

**تنظيم الحصّة المقترح:**
- ٥ دقائق: تمهيدٌ ومفردات.
- محطّات بالتناوب: نظّارةٌ أو اثنتان، وبقيّة الطلاب على الأجهزة اللوحيّة في وضع الشاشة.
- ٥ دقائق: نقاشٌ وورقة عمل «فجأةً أم ببطء؟ في مكانها أم انتقلت؟».

---

## 10. Notes for the build team

1. **Store every string by ID** (the IDs in section 9) in one content file, with fields `{id, speaker, text_m, text_f?, audio_m, audio_f?}`. No Arabic inside logic code (both versions mix them today).
2. **Voice:** recorded MP3/OGG per ID and gender variant. Speech synthesis only as a fallback. The caption always shows. «نسمعُ مرّةً أخرى» replays the last line.
3. **Quiz:** forms A and B; shuffle per attempt; record `{item, form, order[], firstChoice, chosenConcept, correct, hintsUsed, ms}`. Active correction after a wrong answer, no score change. A deliberate select in VR; in gaze mode, a 2.5 s dwell plus a confirm pad.
4. **Station state machine:** predict → watch → explain → evidence (hotspot ray-cast; hint 1 at 10 s or the first miss; hint 2 glows the target) → practice (S3, S4) → close. «التالي» is disabled until the evidence step is done on the first pass.
5. **Animations to change:**
   - Weathering: show the agents (rain, a day/night cycle, a root), slow cracking, pieces slumping inside the footprint, and the time-lapse chip. No shaking or hopping.
   - Erosion: reuse the weathering fragments; add the wind and sand clip; keep the «من هنا / إلى هنا» signs as the evidence reveal.
   - Volcano: add ash and small ejected rocks.
   - Human changes: visible workers plus three actions (dig, build, pave); keep the before/after easel.
   - Quiz: render 10 new vignettes (section 9.7) instead of reusing station thumbnails.
6. **Fixes carried over:**
   - V2: hub greeting bug (2145 with 1804-1805); skipping and free challenge before all stations are visited (1684, 1696, 1799).
   - V1: colour-only wrong feedback (5090-5094); Ali silent on Q2-Q5 (9647-9651).
   - Both: digit consistency (V2 1682 vs 1901).
   - Both: gender variants for the badge and certificate.
7. **To check against the student book before final recording:** the exact wording of the five definitions (V1's look textbook-derived); whether wind is named for erosion; «أجزاء» or «قِطَع»; «مظاهر» or «ظواهر»; the digit system; the local term for land reclamation («الدِّفان» / «ردم البحر»).
