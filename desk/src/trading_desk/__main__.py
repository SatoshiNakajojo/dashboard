"""Point d'entree `python -m trading_desk`.

Le garde n'est pas decoratif : sans lui, un simple `import trading_desk.__main__`
— par un outil d'inspection, un collecteur de tests, un linter — demarre le desk
et son serveur. Demarrer un processus de trading par accident est exactement le
genre de surprise dont on se passe.
"""

from .app import main

if __name__ == "__main__":
    main()
