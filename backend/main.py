from fastapi import FastAPI

app = FastAPI(title="Tyre Degradation Intelligence")


@app.get("/")
def read_root():
    return {"message": "Tyre Degradation Intelligence API is running"}
