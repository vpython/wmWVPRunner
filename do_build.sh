gcloud builds submit --tag us.gcr.io/glowscript/wmvvprunner .
gcloud run deploy wmvvprunner --image us.gcr.io/glowscript/wmvvprunner
