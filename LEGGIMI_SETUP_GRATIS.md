# PianoCasa — setup gratuito (senza carta)

Questa cartella PUBBLICA non contiene i vostri dati sanitari o i menu personali. Le diete si importano dopo il login dal file PRIVATO separato.

## Servizi usati
- GitHub Pages: ospita la PWA.
- Firebase Spark: login + database Firestore. Non collegare un account di fatturazione.
- GitHub Actions: invia i promemoria tramite Web Push.

## 1. Firebase
1. Crea un progetto su https://console.firebase.google.com/ senza attivare Blaze/fatturazione.
2. Authentication > Sign-in method > abilita Email/Password.
3. Firestore Database > Create database.
4. Project settings > Your apps > aggiungi una Web app e copia `firebaseConfig`.
5. Apri `config.js` e sostituisci i 6 valori `INCOLLA_...`.
6. Firestore > Rules: copia il contenuto di `firestore.rules` e pubblica.
7. Project settings > Service accounts > Generate new private key. Conserva il JSON: servirà come GitHub Secret, NON va messo nei file pubblici.

## 2. GitHub Pages
1. Crea un account GitHub gratuito se non lo hai.
2. Crea un repository PUBBLICO, ad esempio `pianocasa`.
3. Carica SOLO i file di questa cartella pubblica.
4. Settings > Pages > Deploy from a branch > main / root.
5. L'indirizzo sarà `https://TUO-UTENTE.github.io/pianocasa/`.

## 3. Secrets per notifiche
Repository GitHub > Settings > Secrets and variables > Actions > New repository secret:
- `FIREBASE_SERVICE_ACCOUNT`: incolla l'intero JSON della chiave Firebase.
- `VAPID_PUBLIC_KEY`: usa il valore indicato nel file privato `CHIAVI_PUSH_PRIVATE.txt`.
- `VAPID_PRIVATE_KEY`: usa il valore privato indicato nello stesso file.
- `VAPID_SUBJECT`: per esempio `mailto:tuamail@example.com`.

Il workflow gira ogni 30 minuti, controlla l'orario scelto da ciascun account e non manda più di un promemoria al giorno.

## 4. Primo accesso
1. Apri il sito su iPhone e crea l'account di Vincenzo.
2. Tocca “Sono Vincenzo · crea famiglia”.
3. In Impostazioni importa `PianoCasa_diete_PRIVATE.json` dal telefono.
4. Genera il codice invito per Anna.
5. Anna apre lo stesso sito, crea il suo account e inserisce il codice.
6. Su entrambi: Safari > Condividi > Aggiungi alla schermata Home.
7. Aprire l'app dalla schermata Home e premere “Attiva notifiche su questo iPhone”.

## Privacy
Non caricare `PianoCasa_diete_PRIVATE.json` né `CHIAVI_PUSH_PRIVATE.txt` nel repository pubblico.
