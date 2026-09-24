# PianoCasa v15 — Login persistente + Siri

## 1. File GitHub da sostituire
- app.js
- index.html
- style.css
- sw.js
- scripts/send-reminders.mjs

## 2. Regole Firebase
In Firebase Console > Firestore Database > Regole:
sostituisci le regole con il contenuto di `firestore.rules` e premi Pubblica.

La nuova regola `siriPublic`:
- consente di leggere UN documento solo se si conosce la chiave casuale;
- vieta di elencare la raccolta;
- consente modifiche solo agli utenti autenticati appartenenti alla famiglia.

## 3. Login
La v15 usa due persistenze locali Firebase:
1. IndexedDB
2. localStorage come fallback

L'app non mostra più la schermata di login mentre Firebase sta ancora cercando
una sessione già salvata.

Dopo l'aggiornamento:
- effettua il login una volta dall'icona PianoCasa installata nella Home;
- da quel momento usa sempre quella stessa icona.
Non premere "Esci" a meno che tu voglia realmente disconnettere il dispositivo.

## 4. Attivare Siri
PianoCasa > Impostazioni > Siri e Comandi Rapidi > Attiva collegamento Siri.

Poi:
- premi "Copia URL dati Siri";
- l'URL sarà lo stesso per i Comandi Rapidi di quella famiglia;
- nell'app vengono mostrati anche i nomi esatti dei campi per Vincenzo/Anna.

## 5. Comandi desiderati
Sul telefono di Vincenzo:
- Cosa ho per colazione? -> `vincenzo_breakfast`
- Cosa ho per pranzo? -> `vincenzo_lunch`
- Cosa ho per spuntino? -> `vincenzo_snack`
- Cosa ho per cena? -> `vincenzo_dinner`
- Qual è il menu di oggi? -> `vincenzo_full`
- Cosa mangia Anna oggi? -> `anna_full`

Sul telefono di Anna gli stessi quattro comandi usano `anna_*`.

## 6. Come costruire ogni Comando Rapido
Nel prossimo passaggio posso guidarti tocco per tocco su iPhone.
La logica è:
1. "Ottieni contenuti dell'URL" usando l'URL copiato da PianoCasa.
2. Dal dizionario ottenuto prendi `fields`.
3. Prendi il campo desiderato, es. `vincenzo_lunch`.
4. Prendi `stringValue`.
5. Usa "Pronuncia testo".
6. Dai al comando il nome da dire a Siri, es. "Cosa ho per pranzo?".

Il documento viene aggiornato immediatamente quando PianoCasa è aperta e,
grazie al workflow GitHub già esistente, viene riallineato periodicamente
anche se la PWA è chiusa.
