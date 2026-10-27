# Dizionario statico di acronimi/termini comuni in informatica, usato come
# fallback quando l'utente non ha configurato una chiave LLM personale (vedi
# services/llm/). Copertura volutamente limitata ai termini più noti: per una
# vera espansione semantica (sinonimi/varianti di dominio non elencabili a
# priori) serve un modello capace di ragionare sul significato, non un lookup.
CS_ACRONYMS: dict[str, list[str]] = {
    # AI / Machine Learning
    "ai": ["Artificial Intelligence"],
    "agi": ["Artificial General Intelligence"],
    "ml": ["Machine Learning"],
    "mlops": ["Machine Learning Operations"],
    "dl": ["Deep Learning"],
    "nlp": ["Natural Language Processing"],
    "cv": ["Computer Vision"],
    "rl": ["Reinforcement Learning"],
    "nn": ["Neural Network"],
    "mlp": ["Multilayer Perceptron"],
    "cnn": ["Convolutional Neural Network"],
    "rnn": ["Recurrent Neural Network"],
    "gnn": ["Graph Neural Network"],
    "lstm": ["Long Short-Term Memory"],
    "gan": ["Generative Adversarial Network"],
    "vae": ["Variational Autoencoder"],
    "vit": ["Vision Transformer"],
    "llm": ["Large Language Model"],
    "rag": ["Retrieval-Augmented Generation"],
    "svm": ["Support Vector Machine"],
    "knn": ["K-Nearest Neighbors"],
    "gpt": ["Generative Pre-trained Transformer"],
    "bert": ["Bidirectional Encoder Representations from Transformers"],
    "gd": ["Gradient Descent"],
    "sgd": ["Stochastic Gradient Descent"],
    "relu": ["Rectified Linear Unit"],
    "pca": ["Principal Component Analysis"],
    "mdp": ["Markov Decision Process"],
    "xai": ["Explainable Artificial Intelligence"],
    "iid": ["Independent and Identically Distributed"],
    # Software generico / web
    "iot": ["Internet of Things"],
    "api": ["Application Programming Interface"],
    "sdk": ["Software Development Kit"],
    "ide": ["Integrated Development Environment"],
    "ui": ["User Interface"],
    "ux": ["User Experience"],
    "hci": ["Human-Computer Interaction"],
    "os": ["Operating System"],
    "oop": ["Object-Oriented Programming"],
    "dsl": ["Domain-Specific Language"],
    "ast": ["Abstract Syntax Tree"],
    "vcs": ["Version Control System"],
    "tdd": ["Test-Driven Development"],
    "ddd": ["Domain-Driven Design"],
    "json": ["JavaScript Object Notation"],
    "xml": ["Extensible Markup Language"],
    "http": ["Hypertext Transfer Protocol"],
    "https": ["Hypertext Transfer Protocol Secure"],
    "rest": ["Representational State Transfer"],
    "crud": ["Create Read Update Delete"],
    "orm": ["Object-Relational Mapping"],
    "cors": ["Cross-Origin Resource Sharing"],
    "ftp": ["File Transfer Protocol"],
    "ssh": ["Secure Shell"],
    # Database
    "db": ["Database"],
    "sql": ["Structured Query Language"],
    "nosql": ["Not Only SQL"],
    "acid": ["Atomicity, Consistency, Isolation, Durability"],
    "cap": ["Consistency, Availability, Partition tolerance"],
    "etl": ["Extract, Transform, Load"],
    "olap": ["Online Analytical Processing"],
    "oltp": ["Online Transaction Processing"],
    # Sicurezza
    "xss": ["Cross-Site Scripting"],
    "csrf": ["Cross-Site Request Forgery"],
    "ddos": ["Distributed Denial of Service"],
    "2fa": ["Two-Factor Authentication"],
    "mfa": ["Multi-Factor Authentication"],
    "pki": ["Public Key Infrastructure"],
    "tls": ["Transport Layer Security"],
    "ssl": ["Secure Sockets Layer"],
    "oauth": ["Open Authorization"],
    "iam": ["Identity and Access Management"],
    # Reti / infrastruttura
    "tcp": ["Transmission Control Protocol"],
    "ip": ["Internet Protocol"],
    "dns": ["Domain Name System"],
    "vpn": ["Virtual Private Network"],
    "cdn": ["Content Delivery Network"],
    "lb": ["Load Balancer"],
    "ci": ["Continuous Integration"],
    "cd": ["Continuous Deployment"],
    "vm": ["Virtual Machine"],
    "hpc": ["High-Performance Computing"],
    "mpi": ["Message Passing Interface"],
    "simd": ["Single Instruction, Multiple Data"],
    # Cloud
    "p2p": ["Peer-to-Peer"],
    "saas": ["Software as a Service"],
    "paas": ["Platform as a Service"],
    "iaas": ["Infrastructure as a Service"],
    # Hardware / altro
    "gpu": ["Graphics Processing Unit"],
    "cpu": ["Central Processing Unit"],
    "vr": ["Virtual Reality"],
    "ar": ["Augmented Reality"],
    # Blockchain
    "dlt": ["Distributed Ledger Technology"],
    "nft": ["Non-Fungible Token"],
    "dao": ["Decentralized Autonomous Organization"],
}


def expand_via_dictionary(terms: list[str]) -> list[str]:
    exclude = {t.strip().lower() for t in terms}
    seen = set()
    suggestions = []
    for term in terms:
        for expansion in CS_ACRONYMS.get(term.strip().lower(), []):
            key = expansion.lower()
            if key in exclude or key in seen:
                continue
            seen.add(key)
            suggestions.append(expansion)
    return suggestions
