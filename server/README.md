# Progress sync on this laptop

The user service `immich-sort-sync` listens on port 2284. It verifies each request
against the local Immich `/api/users/me` endpoint using the supplied API key.
It stores no API keys and cannot change photos. Each Immich user has separate
progress. The Android app uses the same server hostname with port 2284.

Completed decisions merge by photo ID and decision timestamp. Pending swipes
are local only. Manual completion records the currently loaded photo IDs, so new
uploads are still unsorted. Existing phone progress uploads after installing the
new APK without clearing app data. Sync runs while the app is open, on changes,
and every 30 seconds; Settings also has Sync progress now. Failed sync preserves
local progress for retry.

Service: `systemctl --user status immich-sort-sync`
Data: `/home/thijs/Projects/immich-sort/server/data/progress.sqlite3`
Health: `http://localhost:2284/health`

The service starts with this user's login. This laptop currently has user
lingering disabled, so it is not guaranteed to run while the user is logged out.
Use on the trusted home network, matching the existing HTTP Immich setup.
No public router port forwarding is configured. For HTTPS/reverse-proxy setups,
port 2284 also needs matching HTTPS configuration.

Back up progress along with the photos and Immich database. For a consistent
SQLite backup while running, use Python sqlite3.Connection.backup; alternatively
stop this service briefly and copy the database, then start it. The second laptop
backup has not been configured by this change.

## Photo-copy overview

`GET /backup-status` verifies the caller with Immich using the same API key as
progress sync. It returns aggregate original-media counts and bytes across all
accounts, not filenames, and the authenticated account's active and trashed asset
totals from Immich. The API key needs `asset.statistics` for those two totals.
`backup_status.py` scans `upload/` and `library/` beneath
`PHOTO_LIBRARY_ROOT` (default `/home/thijs/immich-library`), excluding generated
media and sidecars. Measurements are cached for 60 seconds. The app polls every
30 seconds while foregrounded and marks measurements older than two minutes stale.
The service remembers when measured file counts or byte totals first differ in
`server/data/backup-gap.json`. The app keeps the backup bar amber for 30 days,
then turns it red; the server bar is measured independently.

For the second laptop it uses the dedicated `~/.ssh/immich_monitor` key with
strict host-key checking and batch mode, requesting `photo-status` from
`thijs@192.168.68.117`. The backup laptop restricts that key to its installed
read-only `monitor-status.py` command. It measures the mirror under
`/home/thijs/Immich-Backup/mirror/` and counts original-media versions in the
30-day history separately. Its history count excludes the initial hard-linked
baseline. The backup cannot identify active or trashed Immich assets, so those
account-specific counts appear only on the server laptop card. A missing login
or failed scan produces an unavailable status, retaining the original timestamp
of any prior measurement. `PHOTO_MONITOR_KEY` overrides the key location. An
optional local JSON snapshot at `PHOTO_BACKUP_STATUS` (default
`server/data/backup-status.json`) can supply `files`, `bytes`, and `measuredAt`
(Unix milliseconds). Never refresh the snapshot timestamp unless the backup has
actually been measured.

The backup laptop pulls originals every 15 minutes using a dedicated SSH key
restricted to read-only rsync access to `/home/thijs/immich-library`. Changed or
deleted mirror files are retained under `/home/thijs/Immich-Backup/history/` for
30 days. The existing mirror was hard-linked as the initial recovery baseline
before the first catch-up sync. The user timer requires lingering to remain
active after logout; enable it with `sudo loginctl enable-linger thijs` on the
backup laptop.


## Rollenwissel — 10 november 2026

De actieve Immich-server is nu `http://100.118.124.29:2283`, versie 3.3.5
met dezelfde accounts, database en foto-inhoud. vDfotos-synchronisatie draait daar
op poort 2284. `PHOTO_BACKUP_HOST=thijs@100.114.241.126` wijst de monitor naar
de nieuwe mirror; de meetsleutel blijft uitsluitend-lezen.

Deze ontwikkellaptop (`100.114.241.126`) is nu mirror. De bestaande fotomap
`/home/thijs/immich-library` wordt via `~/Immich-Backup/mirror` gebruikt en
iedere 15 minuten bijgewerkt wanneer deze laptop beschikbaar is. Verwijderde of
gewijzigde bestanden blijven 30 dagen in `~/Immich-Backup/history`.
De SSH-pullsleutel `~/.ssh/immich_mirror_pull` heeft uitsluitend-lezen toegang
tot de fotomap op de nieuwe server. De oude lokale Immich-containers zijn
behouden maar gestopt en hebben restart=no. De oude sorteerservice is uitgeschakeld.

De volledige laatste fotokopie is vóór activering inhoudelijk via rsync --checksum
vergeleken. De database werd geëxporteerd terwijl de oude server gestopt was;
de doeldump is op SHA-256 en gzip-integriteit gecontroleerd en transactioneel
hersteld. De sorteervoortgang is via SQLite backup overgezet zonder een bestaande
doeldatabase te overschrijven. Een consistente voortgangskopie wordt op de nieuwe
server iedere 15 minuten onder immich-library/backups/vdfotos-progress.sqlite3
bewaard en gaat mee naar de mirror. Immichs eigen databasebackups blijven actief.

De oude mirror en geschiedenis op de nieuwe server zijn bewaard als extra
herstelmogelijkheid. Verwijder deze niet voordat herstel en telefoongebruik bevestigd
zijn. De actieve server blijft wakker bij inactiviteit en dichtklappen; het scherm
mag uit. Netvoeding en Linger=yes zijn gecontroleerd. Een fysieke herstart/dichtklaptest
is tijdens deze migratie niet uitgevoerd.
