import os

from alchemy import Alchemy

# A server with authentication disabled ignores the token.
alchemy = Alchemy(
    base_url=os.getenv("ALCHEMY_URL", "http://localhost:8780"),
    token=os.getenv("ALCHEMY_TOKEN", "local"),
)

print("Server:", alchemy.get_version(request={}).version)

for function in alchemy.function.list().functions or []:
    print(function.id, function.name)
