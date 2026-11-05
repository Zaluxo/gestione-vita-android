# Progetto: Gestione Vita (Android)
App personale per gestire la vita da solo: Oggi, Pasti/Spesa, Casa, Soldi, Note.

## Stack
- Capacitor + HTML/CSS/JS (niente framework pesanti)
- Firebase: Auth (Google), Firestore, AI Logic (Gemini, piano Spark gratuito)
- Interfaccia di riferimento: riferimenti/gestione-vita-originale.html
  (versione artifact: usa window.claude per sample, mcp e db; vanno sostituiti)
- Google Calendar: NON nella v1 (rimandato alla v2)

## Regole
- Costo zero: nessun servizio a pagamento, nessuna carta collegata.
- Mai chiavi API nel codice: AI solo tramite Firebase AI Logic.
- Lavora per fasi: fai solo la fase richiesta, poi fermati.
- Dopo ogni fase: cosa hai fatto, cosa non hai verificato, come provarlo in 5 passi.
- Un commit Git per fase funzionante, messaggio in italiano.
- Spiega i comandi da eseguire: l'utente non è uno sviluppatore esperto.
- Non dichiarare funzionante ciò che non hai testato.
- Rispondi in italiano.
