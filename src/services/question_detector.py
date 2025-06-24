#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import sys
import json
import re
import numpy as np
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity
import warnings

# Suprimir warnings desnecessários
warnings.filterwarnings("ignore")

# Forçar codificação UTF-8 para stdin/stdout
if sys.version_info.major >= 3 and sys.version_info.minor >= 7:
    sys.stdin.reconfigure(encoding='utf-8')
    sys.stdout.reconfigure(encoding='utf-8')

class QuestionDetector:
    def __init__(self):
        """Inicializa o detector de perguntas com modelo de embeddings em português"""
        try:
            # Modelo otimizado para português
            self.model = SentenceTransformer("sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2")
            self.question_patterns = [
                r"\\?",  # Termina com ?
                r"^(como|quando|onde|por que|porque|qual|quais|quem|o que|que)",  # Palavras interrogativas
                r"^(posso|pode|consegue|tem como|é possível)",  # Perguntas de possibilidade
                r"^(você|vocês|alguém)",  # Direcionamento
                r"(status|situação|andamento).*?(pedido|compra|produto)",  # Perguntas sobre status
            ]
        except Exception as e:
            print(f"Erro ao inicializar modelo: {e}", file=sys.stderr)
            sys.exit(1)

    def preprocess_text(self, text):
        """Pré-processa o texto para melhor análise"""
        if not text:
            return ""
        
        # Converte para minúsculas
        text = text.lower().strip()
        
        # Remove caracteres especiais excessivos, mas mantém pontuação importante
        text = re.sub(r"[^\\w\\s\\?\\!\\.\\,\\-]", " ", text)
        
        # Remove espaços múltiplos
        text = re.sub(r"\\s+", " ", text)
        
        return text

    def is_question_by_pattern(self, text):
        """Verifica se o texto é uma pergunta baseado em padrões"""
        preprocessed = self.preprocess_text(text)
        
        for pattern in self.question_patterns:
            if re.search(pattern, preprocessed, re.IGNORECASE):
                return True
        
        return False

    def generate_embedding(self, text):
        """Gera embedding para um texto"""
        try:
            preprocessed = self.preprocess_text(text)
            embedding = self.model.encode([preprocessed])
            return embedding[0]
        except Exception as e:
            print(f"Erro ao gerar embedding: {e}", file=sys.stderr)
            return None

    def find_most_similar_question(self, user_message, questions_db, threshold=0.7):
        """Encontra a pergunta mais similar no banco de dados"""
        try:
            user_embedding = self.generate_embedding(user_message)
            if user_embedding is None:
                return None, 0.0

            best_match = None
            best_similarity = 0.0

            for question in questions_db:
                # Se não tem embedding pré-calculado, calcula agora
                if "pergunta_embedding" not in question or not question["pergunta_embedding"]:
                    question_embedding = self.generate_embedding(question["pergunta_texto"])
                    question["pergunta_embedding"] = question_embedding.tolist() if question_embedding is not None else []
                else:
                    question_embedding = np.array(question["pergunta_embedding"])

                if question_embedding is not None and len(question_embedding) > 0:
                    # Calcula similaridade de cosseno
                    similarity = cosine_similarity(
                        user_embedding.reshape(1, -1),
                        question_embedding.reshape(1, -1)
                    )[0][0]

                    if similarity > best_similarity:
                        best_similarity = similarity
                        best_match = question

            return best_match, float(best_similarity) # Converte para float nativo

        except Exception as e:
            print(f"Erro ao encontrar pergunta similar: {e}", file=sys.stderr)
            return None, 0.0

    def detect_question(self, user_message, questions_db, threshold=0.7):
        """Detecta se a mensagem é uma pergunta e encontra a melhor resposta"""
        try:
            # Primeiro verifica se é uma pergunta por padrões
            is_question_pattern = self.is_question_by_pattern(user_message)
            
            # Encontra a pergunta mais similar
            matched_question, similarity = self.find_most_similar_question(
                user_message, questions_db, threshold
            )

            # Considera como pergunta se:
            # 1. Tem padrão de pergunta OU
            # 2. Tem alta similaridade com pergunta cadastrada
            is_question = bool(similarity >= threshold) # Prioriza a similaridade

            result = {
                "is_question": is_question,
                "similarity": float(similarity),
                "matched_question_id": matched_question.get("id") if matched_question else None,
                "matched_question": matched_question,
                "pattern_detected": bool(is_question_pattern) # Converte para bool nativo
            }

            return result

        except Exception as e:
            print(f"Erro na detecção: {e}", file=sys.stderr)
            return {
                "is_question": False,
                "similarity": 0.0,
                "matched_question_id": None,
                "matched_question": None,
                "pattern_detected": False,
                "error": str(e)
            }

def main():
    if len(sys.argv) < 2:
        print("Uso: python3 question_detector.py <comando> [argumentos]", file=sys.stderr)
        sys.exit(1)

    command = sys.argv[1]
    detector = QuestionDetector()

    if command == "test":
        # Teste básico
        print(json.dumps({"status": "ok", "model_loaded": True}))
        
    elif command == "detect":
        if len(sys.argv) < 5:
            print("Uso: python3 question_detector.py detect <mensagem> <questions_db_json> <threshold>", file=sys.stderr)
            sys.exit(1)
        
        user_message = sys.argv[2]
        questions_db_json = sys.argv[3]
        threshold = float(sys.argv[4])
        
        try:
            questions_db = json.loads(questions_db_json)
            result = detector.detect_question(user_message, questions_db, threshold)
            print(json.dumps(result, ensure_ascii=False))
        except json.JSONDecodeError as e:
            print(f"Erro ao decodificar JSON: {e}", file=sys.stderr)
            sys.exit(1)
    
    else:
        print(f"Comando desconhecido: {command}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()

