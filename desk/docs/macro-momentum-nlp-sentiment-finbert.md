# Analyse de Sentiment Quantitative & Pipeline NLP (FinBERT / VADER)

Ce document décrit l'implémentation technique de l'agent **News Watcher** pour filtrer le bruit des réseaux sociaux (Twitter/X) et des flux d'actualités financières, puis calculer un score de sentiment quantitatif exploitable par les modèles d'allocation.

---

## 1. Architecture du Pipeline NLP

Le traitement de l'information s'effectue en trois étapes séquentielles afin de concilier la vitesse nécessaire au traitement des réseaux sociaux et la précision requise pour analyser les rapports macroéconomiques :

```
┌─────────────────────────────────────────────────────────────┐
│                       FLUX DE DONNÉES                       │
│             (Flux RSS, API Twitter/X, Reddit, FMP)          │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 ÉTAPE 1 : FILTRAGE DU BRUIT                 │
│      - Regex de nettoyage (suppression URLs, emojis)        │
│      - Filtrage par entités nommées (NER avec Spacy)        │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│          ÉTAPE 2 : ANALYSE DE SENTIMENT HYBRIDE             │
│   ┌───────────────────────────┐   ┌───────────────────────┐   │
│   │     VADER (Régles NLP)    │   │  FinBERT (Transformer)│   │
│   │  - Rapide (latence < 5ms) │   │ - Précis (finance)    │   │
│   │  - Idéal pour Twitter/X   │   │ - Idéal pour les news │   │
│   └─────────────┬─────────────┘   └───────────┬───────────┘   │
└─────────────────┼─────────────────────────────┼───────────────┘
                  │ (Scores bruts)              │ (Probabilités)
                  ▼                             ▼
┌─────────────────────────────────────────────────────────────┐
│            ÉTAPE 3 : SYNTÈSE & MONOLOGUE INTERNE            │
│   - Calcul du Sentiment Score Composé (S_t)                 │
│   - Génération de vecteurs thématiques (JSON)               │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                PUBLICATION VERS REDIS PUB/SUB               │
│               (Canal: `market:sentiment:signals`)            │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Modèles de Sentiment : Hybridation VADER / FinBERT

Pour optimiser les performances, l'agent utilise deux modèles complémentaires :

1.  **VADER (Valence Aware Dictionary and sEntiment Reasoner)** :
    *   **Utilisation** : Flux Twitter/X et Reddit.
    *   **Avantage** : Traitement à ultra-haute fréquence (latence <5 ms par texte) et gestion native de la ponctuation, des majuscules et de l'argot des marchés crypto ("HODL", "rekt", "buidl").
2.  **FinBERT (BERT pour la Finance)** :
    *   **Utilisation** : Articles de presse (Bloomberg, Reuters), annonces de la Fed et communiqués d'entreprises.
    *   **Avantage** : Modèle basé sur l'architecture Transformer, pré-entraîné sur TRC2-financial et affiné pour classifier précisément le vocabulaire financier (ex: le mot "corporate restructuring" ou "interest rate hike" sera analysé de manière contextuelle).

---

## 3. Implémentation en Python de la Pipeline

Voici le script de production de l'agent pour analyser, nettoyer et fusionner les scores de sentiment d'un flux d'actualités brutes :

```python
import re
import numpy as np
from nltk.sentiment.vader import SentimentIntensityAnalyzer
from transformers import AutoTokenizer, AutoModelForSequenceClassification
import torch

class SentimentAnalysisPipeline:
    def __init__(self):
        # Initialisation de VADER
        self.vader = SentimentIntensityAnalyzer()
        self.vader.lexicon.update({
            'hodl': 2.0,
            'rekt': -3.0,
            'moon': 2.5,
            'dump': -2.5,
            'pump': 2.0,
            'bullish': 2.5,
            'bearish': -2.5
        })
        
        # Initialisation de FinBERT via Hugging Face
        self.finbert_tokenizer = AutoTokenizer.from_pretrained("ProsusAI/finbert")
        self.finbert_model = AutoModelForSequenceClassification.from_pretrained("ProsusAI/finbert")
        
        # Utilisation du GPU si disponible
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.finbert_model.to(self.device)
        self.finbert_model.eval()

    def clean_text(self, text: str) -> str:
        """Nettoie le texte pour l'analyse NLP en préservant le jargon financier."""
        text = re.sub(r"http\S+|www\S+|https\S+", "", text, flags=re.MULTILINE)  # Supprime URLs
        text = re.sub(r"@\S+", "", text)  # Supprime mentions
        return text.strip()

    def get_vader_score(self, text: str) -> float:
        """Calcule le score composé VADER normalisé entre -1.0 (très baissier) et +1.0 (très haussier)."""
        scores = self.vader.polarity_scores(text)
        return scores['compound']

    def get_finbert_score(self, text: str) -> float:
        """Interroge FinBERT et retourne un score de sentiment normalisé de -1.0 à +1.0."""
        inputs = self.finbert_tokenizer(text, return_tensors="pt", padding=True, truncation=True, max_length=512)
        inputs = {k: v.to(self.device) for k, v in inputs.items()}
        
        with torch.no_grad():
            outputs = self.finbert_model(**inputs)
            predictions = torch.nn.functional.softmax(outputs.logits, dim=-1)
            probs = predictions[0].cpu().numpy()
            
        # FinBERT labels: [0] Positive, [1] Negative, [2] Neutral
        pos_prob, neg_prob, neu_prob = probs[0], probs[1], probs[2]
        
        # Score directionnel net pondéré
        net_score = pos_prob - neg_prob
        return float(net_score)

    def process_document(self, text: str, source_type: str) -> dict:
        """Route le texte vers le bon analyseur selon la source et retourne le score composé."""
        cleaned = self.clean_text(text)
        
        if source_type in ["social_media", "twitter", "reddit"]:
            score = self.get_vader_score(cleaned)
            method = "VADER"
        else:
            score = self.get_finbert_score(cleaned)
            method = "FinBERT"
            
        return {
            "cleaned_text": cleaned,
            "raw_score": score,
            "sentiment_label": "positive" if score > 0.15 else "negative" if score < -0.15 else "neutral",
            "method": method
        }
```

---

## 4. Calcul de l'Indicateur Macro-Sentiment Composé

Pour chaque actif, l'agent calcule une moyenne mobile exponentielle du sentiment sur une fenêtre temporelle glissante de \\(\lambda\\) périodes. Le score composé à l'instant \\(t\\) s'écrit :

\\[S_{composed}(t) = \alpha \cdot S_{news}(t) + (1 - \alpha) \cdot S_{social}(t)\\]

Où :
*   \\(S_{news}\\) est la moyenne des scores FinBERT des articles de presse de la dernière heure (pondérée par la réputation de la source).
*   \\(S_{social}\\) est le score médian VADER des tweets/posts de la dernière heure, ajusté par le volume de mentions.
*   \\(\alpha\\) est le coefficient de répartition (généralement fixé à **0.7** pour les actions et **0.3** pour les crypto-monnaies, où la dynamique sociale prédomine).

---

## 5. Intégration dans le Moteur Systematique

Une fois calculé, le signal de sentiment est publié sur Redis et sert de **filtre de momentum** ou de **condition de coupure de sécurité** :
*   **Achat en Tendance** : Une position longue n'est autorisée par le *Desk Manager* que si \\(S_{composed} > 0.15\\).
*   **Vente à Découvert** : Une position courte n'est autorisée que si \\(S_{composed} < -0.15\\).
*   **Filtre de Panique** : Si \\(S_{composed}\\) d'un actif s'effondre de plus de 4 écarts-types en moins de 15 minutes, toutes les positions à effet de levier ouvertes sur cet actif sont immédiatement coupées par l'agent d'exécution.
