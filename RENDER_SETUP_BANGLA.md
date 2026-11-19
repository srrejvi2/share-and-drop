# S&D (Share and Drop) — Render-এ চালু করার নিয়ম

এটি সবার জন্য উন্মুক্ত ওয়েবসাইট। দর্শকদের login, signup, OTP বা account লাগবে না।
ওয়েবসাইট চালু ও পরিচালনা করার জন্য শুধু আপনার GitHub এবং Render account লাগবে।

## ১. ZIP extract করুন

`Share_and_Drop_Render_Ready.zip` extract করুন। ভেতরের `package.json`,
`render.yaml`, `src`, `public`, `scripts` এবং অন্য ফাইলগুলো একসঙ্গে রাখুন।
শুধু `index.html` বা `dist` ফোল্ডার upload করলে signaling কাজ করবে না।

## ২. GitHub-এ ফাইল দিন

1. GitHub-এ একটি নতুন repository বানান। নাম দিতে পারেন `share-and-drop`।
2. **Add file → Upload files** থেকে extract করা ফাইল ও ফোল্ডার upload করুন।
3. **Commit changes** দিন।
4. Repository-র প্রথম পাতাতেই `package.json` এবং `render.yaml` দেখা যাচ্ছে কি না দেখুন।

ZIP ফাইলটি সরাসরি repository-তে রেখে দিলে Render কোড build করতে পারবে না।
Repository private হলেও Render-এ deploy করা ওয়েবসাইট public হতে পারে।
মোবাইলে folder upload সুবিধা সীমিত হলে কম্পিউটার থেকে এই ধাপটি করুন।

## ৩. Render-এ Web Service বানান

1. Render dashboard-এ **New → Web Service** নির্বাচন করুন।
2. GitHub connect করে আপনার `share-and-drop` repository নির্বাচন করুন।
3. নিচের settings দিন:

| Render setting | কী দেবেন |
| --- | --- |
| Name | `share-and-drop` বা পাওয়া যায় এমন অন্য নাম |
| Runtime / Language | `Node` |
| Branch | যে branch-এ ফাইল upload করেছেন, সাধারণত `main` |
| Root Directory | খালি রাখুন, যদি `package.json` repository-র প্রথম স্তরে থাকে |
| Build Command | `npm ci --include=dev && npm run build` |
| Start Command | `npm start` |
| Instance Type | `Free` |
| Health Check Path | `/health` |

Environment variables-এ দিন:

| Key | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `TRUST_PROXY` | `true` |

`PORT` নিজে বসাতে হবে না। Database, storage bucket বা login API লাগবে না।
তারপর **Deploy Web Service** চাপুন।

বিকল্পভাবে **New → Blueprint** থেকে একই repository connect করলে দেওয়া
`render.yaml` দিয়ে settings স্বয়ংক্রিয়ভাবে আসবে। দুটি পদ্ধতির যেকোনো একটি ব্যবহার করুন।
**Static Site** নির্বাচন করবেন না; এই প্রজেক্টের WebSocket server দরকার।

## ৪. Public লিংক ব্যবহার করুন

Deploy শেষে Render একটি HTTPS ঠিকানা দেবে, যেমন
`https://your-service-name.onrender.com`। এটি উদাহরণ; আপনার dashboard-এর আসল
ঠিকানা ব্যবহার করুন। অন্য ফোনের incognito/private browser-এও login ছাড়া খুলবে।
কোডে domain বসাতে হবে না—ওয়েবসাইট নিজের ঠিকানা থেকে connection service খুঁজে নেবে।

ব্যবহারের নিয়ম:

1. Host ডিভাইসে ওয়েবসাইট খুলে **Choose files** চাপুন।
2. QR/link তৈরি হলে অন্যদের দিন।
3. Receiver QR scan বা link খুলে **Download** চাপবে।
4. প্রয়োজন হলে শেষে **Save file** চাপবে।
5. Host পেজ খোলা ও সচল রাখবে। **Stop sharing** চাপলে নতুন transfer বন্ধ হবে।

## ৫. প্রথম বাস্তব পরীক্ষা

- একটি ছোট text বা photo ফাইল দিয়ে শুরু করুন।
- প্রথমে একই Wi-Fi-এর দুই ডিভাইস, পরে Wi-Fi ও mobile data-এর মধ্যে পরীক্ষা করুন।
- দুই receiver দিয়ে চেষ্টা করুন; শেষে SHA-256 verified এবং Save file দেখুন।
- বড় ফাইলে Pause/Resume এবং host-এর Stop sharing পরীক্ষা করুন।
- Report export করে আপনার project demo-র বাস্তব transfer result রাখুন।

## যেসব সীমা জানা দরকার

**ফাইল সার্ভারে upload হয় না, তবে সংযোগ করানোর server থাকে।** Render server
অস্থায়ী connection information RAM-এ রাখে। মূল ফাইল host ডিভাইসেই থাকে;
receiver নিজের ডিভাইসে কপি পায়। Server restart হলে connection records হারায়।

**কিছু নেটওয়ার্কে TURN লাগবে।** Default STUN দিয়ে direct connection চেষ্টা হয়।
কিছু mobile operator, office firewall বা restrictive NAT-এ connection আটকে যেতে
পারে। সেক্ষেত্রে নিজের TURN service যোগ করতে হবে। Render-এর web service নিজে TURN
relay নয়। এই ZIP-এ কোনো paid/free TURN account বা credentials দেওয়া নেই।
TURN-এর encrypted packet forwarding ফাইল সংরক্ষণ নয়। সেটআপের বিস্তারিত README-তে আছে।

**Free service ঘুমাতে পারে।** Render Free-তে ১৫ মিনিট HTTP request বা WebSocket
message না এলে service sleep হতে পারে; পরের visitor-এর জন্য চালু হতে প্রায় এক মিনিট
লাগতে পারে। Active session-এর signaling heartbeat থাকে, কিন্তু restart/deploy বা
free-plan limits-এর কারণে interruption হতে পারে। প্রয়োজন হলে নতুন QR তৈরি করুন।

**ফোন lock/background হলে transfer থামতে পারে।** Wake lock সব browser/OS-এ
নিশ্চিত নয়। Host tab refresh/close হলে পুরোনো QR দিয়ে নতুন download হবে না।
Receiver-এর screen-এ host হারানোর খবর আসতে ১২–৩০ সেকেন্ড লাগতে পারে।

**সব browser-এ unlimited বড় ফাইল নয়।** Disk support ও খালি জায়গার ওপর নির্ভর করে।
Disk writing না থাকলে memory fallback-এর সীমা 128 MiB। একসঙ্গে সর্বোচ্চ ১০ receiver,
প্রতি session-এ সর্বোচ্চ ১০০ file। Folder-এর file আলাদাভাবে যায়; একসঙ্গে ZIP পেতে
Host-এ আগে ZIP বানিয়ে সেটি select করুন।

## সমস্যা হলে

| সমস্যা | করণীয় |
| --- | --- |
| `package.json not found` | repository-র root-এ ফাইল দিন, অথবা সঠিক Root Directory দিন |
| Build-এ esbuild পাওয়া যাচ্ছে না | Build Command-এ `npm ci --include=dev && npm run build` দিন |
| সাইট খুলছে কিন্তু QR আসছে না | Web Service কি না দেখুন; Start Command `npm start` দিন |
| Website প্রথমবার খুলতে দেরি | Free service wake হওয়ার সময় দিন; Render logs দেখুন |
| QR আছে কিন্তু receiver connect হচ্ছে না | Host visible রাখুন, নতুন link নিন, আলাদা নেটওয়ার্ক পরীক্ষা করুন; TURN প্রয়োজন হতে পারে |
| `/health` কাজ করছে না | Render deploy logs-এ build/start error দেখুন |
| পুরোনো QR কাজ করছে না | Host refresh/close হলে নতুন করে file select ও QR share করুন |
| Download হয়েছে কিন্তু ফাইল দেখা যাচ্ছে না | Receiver-এর **Save file** চাপুন, browser downloads/folder দেখুন |

এখানে public web access, বাস্তব WebSocket signaling এবং automated tests যাচাই করা
হয়েছে। এই ZIP আপনার Render account-এ deploy করা হয়নি। বাস্তব phone-to-phone internet
file transfer এখানে যাচাই করা যায়নি; উপরের দুই-ডিভাইস পরীক্ষা দিয়ে সেটি নিশ্চিত করুন।

অফিশিয়াল নির্দেশনা: https://render.com/docs/deploy-node-express-app
