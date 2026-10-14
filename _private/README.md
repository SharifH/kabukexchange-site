# _private — never deployed

Internal-only data (integration owners, escalation contacts, contract notes,
prospect lists). `build.py --production` and `--preview` never copy this folder.
Do not reference these files from any page or script.

Do not commit confidential data to a public repository; this folder is a
convention for keeping it out of the deployed site, not a security control.
