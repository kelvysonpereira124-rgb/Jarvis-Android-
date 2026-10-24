# JARVIS - Assistente Pessoal

Assistente pessoal local para Windows com chat, entrada e resposta por voz, tarefas, notas e lembretes. As conversas podem usar a API da OpenAI ou um modelo local servido pelo Ollama. O histórico do chat fica salvo no navegador e pode ser apagado pelo botão **Limpar conversa**.

## Iniciar no Windows

No PowerShell, configure o provedor e inicie o servidor. Para usar a OpenAI:

```powershell
$env:OPENAI_API_KEY="sua-chave-da-api"
$env:JARVIS_PROVIDER="openai"
python assistant_app.py
```

Em seguida, abra [http://localhost:8000](http://localhost:8000) no Chrome ou Edge. Para ativar a palavra de chamada, use o botão discreto de microfone no canto da tela, permita o acesso quando solicitado e mantenha a página aberta. A voz de saída pode ser alternada no chat.

Para usar IA local, instale e inicie o [Ollama](https://ollama.com/), baixe um modelo e rode o servidor assim:

```powershell
ollama pull qwen2.5:7b
$env:JARVIS_PROVIDER="ollama"
$env:OLLAMA_MODEL="qwen2.5:7b"
python assistant_app.py
```

Para usar a API gratuita do Groq, crie uma chave na [Groq Console](https://console.groq.com/keys) e configure:

```powershell
$env:JARVIS_PROVIDER="groq"
$env:GROQ_API_KEY="sua-chave"
$env:GROQ_MODEL="llama-3.3-70b-versatile"
python assistant_app.py
```

Os limites e modelos disponíveis no Groq podem mudar; confira a [lista atual de modelos](https://console.groq.com/docs/models) e os [limites da API](https://console.groq.com/docs/rate-limits). O JARVIS usa `http://127.0.0.1:11434/v1` por padrão para o Ollama. Se necessário, personalize com `OLLAMA_BASE_URL`. Para OpenAI, `OPENAI_MODEL` escolhe o modelo (padrão `gpt-4o-mini`). As chaves são lidas do ambiente e não são salvas no projeto. Sem provedor de IA configurado, o painel e os comandos locais continuam disponíveis, mas conversas livres exibem uma mensagem de configuração.

## Publicar em um servidor gratuito

### Render (mais simples para testar)

O arquivo `render.yaml` prepara um serviço gratuito. Envie o projeto para um repositório GitHub seu, escolha **New + > Blueprint** no [Render](https://render.com/), conecte o repositório e crie o serviço. No painel do serviço, preencha `GROQ_API_KEY`; o Render gera uma senha para `JARVIS_PASSWORD`. Ao abrir o endereço do site, entre com usuário `jarvis` e a senha mostrada nas variáveis do serviço.

Limitações importantes do plano gratuito: o serviço suspende depois de 15 minutos sem tráfego e pode levar cerca de um minuto para voltar. O disco é temporário; tarefas, notas e lembretes salvos no arquivo JSON podem sumir ao reiniciar, suspender ou publicar uma nova versão. Use o Render para demonstração, não como cópia única dos seus dados.

### Oracle Cloud Always Free (VM contínua)

A [Oracle Cloud Free Tier](https://www.oracle.com/cloud/free/) oferece algumas máquinas Always Free sem mensalidade, sujeitas a limites e disponibilidade regional. O cadastro exige cartão para verificação e contas sem uso podem ser suspensas. Para manter o JARVIS nessa VM, instale Python, copie o projeto para `/opt/jarvis` e use os arquivos em [`deploy/oracle/`](./deploy/oracle/). Crie o usuário e os diretórios persistentes:

```bash
sudo useradd --system --home /opt/jarvis --shell /usr/sbin/nologin jarvis
sudo mkdir -p /opt/jarvis /var/lib/jarvis /etc/jarvis
sudo chown -R jarvis:jarvis /opt/jarvis /var/lib/jarvis
```

Crie `/etc/jarvis/jarvis.env` com permissão `640` (proprietário `root`, grupo `jarvis`) contendo:

```text
JARVIS_HOST=127.0.0.1
JARVIS_PROVIDER=groq
GROQ_API_KEY=sua-chave
JARVIS_USERNAME=jarvis
JARVIS_PASSWORD=escolha-uma-senha-forte
JARVIS_DATA_FILE=/var/lib/jarvis/personal_assistant.json
```

Instale e inicie o serviço:

```bash
sudo cp /opt/jarvis/deploy/oracle/jarvis.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now jarvis
```

Antes de acessar a VM pela internet, configure um proxy HTTPS (por exemplo, Caddy com um domínio) para encaminhar para `127.0.0.1:8000`. Configure o DNS do domínio e libere as portas 80 e 443 nas regras de rede da VM; substitua `jarvis.example.com` em [`deploy/oracle/Caddyfile`](./deploy/oracle/Caddyfile), instale o Caddy e recarregue sua configuração. Não exponha a porta HTTP diretamente: a autenticação básica só é protegida quando usada sobre HTTPS. O servidor exige `JARVIS_PASSWORD` ao escutar em um endereço público.

### Variáveis de implantação

- `JARVIS_HOST`: endereço de escuta. Padrão `127.0.0.1`; use `0.0.0.0` somente atrás de HTTPS e com `JARVIS_PASSWORD`.
- `PORT`: porta fornecida por plataformas como Render. Alternativamente, `JARVIS_PORT` (padrão `8000`).
- `JARVIS_USERNAME` e `JARVIS_PASSWORD`: autenticação HTTP básica para a interface e API. Se não forem configuradas, o servidor recusa iniciar em uma interface pública.
- `JARVIS_DATA_FILE`: caminho do arquivo JSON de tarefas, notas e lembretes. Use armazenamento persistente na VM; o disco gratuito do Render é temporário.
- `JARVIS_PROVIDER`: `openai`, `ollama` ou `groq`.

## Privacidade

O servidor aceita conexões apenas do próprio computador. Com OpenAI ou Groq, a mensagem, o histórico recente do chat e o contexto de tarefas, notas, lembretes e projetos são enviados à API selecionada para gerar a resposta. Com Ollama, esses dados ficam no computador e são enviados ao servidor local configurado. Os comandos e alterações de dados são tratados no computador. O histórico visual salvo fica no armazenamento local do navegador; o botão **Limpar conversa** o remove. O reconhecimento de voz depende do navegador e pode usar os serviços de voz configurados pelo próprio navegador.

## Projetos, ações e voz

O painel inicial mostra somente o núcleo procedural de partículas âmbar em tela cheia, agora com anéis orbitais em perspectiva e paralaxe que acompanha o ponteiro. Mova o mouse sobre o núcleo ou arraste para alterar a rotação; use a roda do mouse para ampliar ou reduzir. Em telas sensíveis ao toque, arraste para girar. O restante dos painéis e controles visuais fica oculto; a conversa e os dados continuam preservados no aplicativo, mas não são exibidos nessa tela. É uma visualização interativa de interface, não um holograma físico.

O JARVIS mantém projetos e etapas no arquivo de dados, mostra o progresso no painel e pode criar planos pela conversa ou pelo formulário. Com provedores compatíveis com ferramentas, ele pode registrar tarefas, notas e lembretes, e reporta separadamente o resultado de cada ação. A conversa recente continua no armazenamento local do navegador e é enviada junto com cada pergunta para preservar contexto. A IA só pode executar as ações limitadas descritas acima; não tem acesso arbitrário ao sistema operacional.

Para ativar a palavra de chamada, clique no botão de microfone no canto da tela, autorize o microfone quando solicitado e mantenha a página aberta. O navegador reinicia o reconhecimento quando possível; diga “Jarvis” e depois o comando. O reconhecimento de fala contínuo não é garantido por todos os navegadores, pode depender de internet e pode enviar áudio/transcrição ao serviço de voz do navegador. Clique novamente no microfone para desligar a escuta ou revogue o acesso ao microfone no navegador.

## Integrações físicas ainda não conectadas

O painel mostra Alexa, comunicações, oficina e sensores como não conectados. Este projeto não atende chamadas nem envia mensagens, não controla dispositivos Alexa ou fechaduras e não monitora câmeras/sensores. Isso requer contas, permissões, aparelhos e adaptadores específicos. Para controle Alexa real, é necessário configurar uma Alexa Smart Home Skill e um endpoint HTTPS com account linking; esses recursos e credenciais não foram criados nem fornecidos. Nunca coloque segredos no repositório ou no chat.

## Exemplos

- `adicionar tarefa revisar proposta`
- `qual a hora?`
- `adicionar nota ideias de marketing`
- `adicionar lembrete reunião às 15h`
- `mostrar tarefas`
