import WebSocket, { WebSocketServer } from "ws";
import OpenAI from "openai";
import http from "http";
import { config } from "dotenv";

config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const client = new OpenAI({
    apiKey: OPENAI_API_KEY,
});

async function chatgptResponse(chatHistory, chatMessage) {
    chatHistory.push({ role: "user", content: chatMessage });

    try {
        const response = await client.chat.completions.create({
            model: "o3-mini",
            messages: chatHistory,
        });

        const assistantMessage = response.choices[0].message.content;
        chatHistory.push({ role: "assistant", content: assistantMessage });
        console.log(assistantMessage);
        return assistantMessage;
    } catch (error) {
        console.log(`OpenAI API error: ${error}`);
        return "Error generating response.";
    }
}

function startHeartbeat(ws) {
    ws.on("close", () => clearInterval(interval));

    const interval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.ping();
        } else {
            clearInterval(interval);
        }
    }, 30000);
}

function handleTextConnection(websocket) {
    console.log("Client connected to text endpoint");
    startHeartbeat(websocket);
    let chatHistory = [];
    const initPrompt =
        "Tu es un villageois du village appele Nidalheim, ne te laisse pas faire si on te provoque, tu as de l'humour donc hesite pas a charier un peu si il y a une occasion. Lorsque tu parles, tu es le plus concis possible, une seule phrase suffit, et de preference une courte phrase. Une personne qui t'es inconnue te parle, il semble etre nouveau dans le village et il te dit: ";
    let initPromptSent = false;
    let prompt = "";

    websocket.on("message", async (message) => {
        try {
            const messageStr = message.toString();
            console.log(`Text message received: ${messageStr}`);

            if (initPromptSent) {
                prompt = messageStr;
            } else {
                prompt = initPrompt + messageStr;
                initPromptSent = true;
            }

            const response = await chatgptResponse(chatHistory, prompt);
            console.log(`Response sent: ${response}`);
            websocket.send(response);
        } catch (error) {
            console.log(
                `Error processing text message: ${error}`,
            );
            websocket.send("Error processing your message.");
        }
    });

    websocket.on("close", () => {
        console.log("Client disconnected from text endpoint");
    });

    websocket.on("error", (error) => {
        console.log(`Text WebSocket error: ${error}`);
    });
}

function handleAudioConnection(clientWs) {
    console.log("Client connected to audio endpoint");
    startHeartbeat(clientWs);

    const systemPrompt =
        "Tu es un villageois du village appelé Nidalheim. Tu parles uniquement en Français. Tu es serviable, si on te pose une question, tu réponds. Lorsque tu parles, tu es le plus concis possible, une seule phrase suffit, et de préférence une courte phrase.";

    const openaiWs = new WebSocket(
        "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview",
        {
            headers: {
                Authorization: `Bearer ${OPENAI_API_KEY}`,
                "OpenAI-Beta": "realtime=v1",
            },
        },
    );

    let responseText = "";
    let waitingForTranscription = false;

    openaiWs.on("open", () => {
        console.log("Connected to OpenAI Realtime API");

        openaiWs.send(
            JSON.stringify({
                type: "session.update",
                session: {
                    modalities: ["text", "audio"],
                    instructions: systemPrompt,
                    voice: "ash",
                    turn_detection: null,
                    input_audio_format: "pcm16",
                    output_audio_format: "pcm16",
                    input_audio_transcription: {
                        model: "whisper-1",
                    },
                },
            }),
        );
    });

    openaiWs.on("message", (data) => {
        try {
            const event = JSON.parse(data.toString());

            switch (event.type) {
                case "session.created":
                    console.log("OpenAI Realtime session created");
                    break;

                case "session.updated":
                    console.log(
                        "OpenAI Realtime session configured successfully",
                    );
                    console.log("Waiting for client speech...");
                    break;

                case "input_audio_buffer.speech_started":
                    console.log("Speech detected");
                    responseText = "";
                    break;

                case "input_audio_buffer.speech_stopped":
                    console.log("End of speech detected");
                    break;

                case "conversation.item.input_audio_transcription.completed":
                    console.log(`>>> TRANSCRIPTION USER: ${event.transcript}`);
                    if (event.transcript && event.transcript.trim()) {
                        clientWs.send(
                            JSON.stringify({
                                type: "user_transcript",
                                data: event.transcript,
                            }),
                        );
                    }
                    break;

                case "response.audio.delta":
                    audioChunksSent++;
                    const outBytes = Buffer.from(event.delta, "base64").length;
                    if (audioChunksSent % 20 === 1) {
                        console.log(
                            `[AUDIO OUT] Chunk #${audioChunksSent} sent to client (${outBytes} bytes)`,
                        );
                    }
                    clientWs.send(
                        JSON.stringify({ type: "audio", data: event.delta }),
                    );
                    break;

                case "response.audio.done":
                    console.log("Audio response complete");
                    break;

                case "response.audio_transcript.delta":
                    responseText += event.delta;
                    break;

                case "response.audio_transcript.done":
                    if (responseText) {
                        console.log(`>>> NPC RESPONSE: ${responseText}`);
                        clientWs.send(
                            JSON.stringify({
                                type: "text",
                                data: responseText,
                            }),
                        );
                        responseText = "";
                    }
                    break;

                case "response.done":
                    console.log("Response complete");
                    responseInProgress = false;
                    break;

                case "error":
                    console.log(
                        `OpenAI Realtime error: ${JSON.stringify(event.error)}`,
                    );
                    clientWs.send(
                        JSON.stringify({
                            type: "error",
                            message: event.error.message,
                        }),
                    );
                    break;

                default:
                    console.log(`[OPENAI EVENT] ${event.type}`);
            }
        } catch (error) {
            console.log(`Error parsing OpenAI message: ${error}`);
        }
    });

    openaiWs.on("error", (error) => {
        console.log(`OpenAI WebSocket error: ${error}`);
        clientWs.send(
            JSON.stringify({
                type: "error",
                message: "OpenAI connection error",
            }),
        );
    });

    openaiWs.on("close", () => {
        console.log("Disconnected from OpenAI Realtime API");
    });

    let audioChunksReceived = 0;
    let audioChunksSent = 0;
    let audioChunksSinceLastCommit = 0;
    let responseInProgress = false;

    clientWs.on("message", (message) => {
        const messageStr = message.toString().trim();

        if (messageStr === "COMMIT" || messageStr.includes("COMMIT")) {
            if (audioChunksSinceLastCommit < 10) {
                console.log(
                    `[AUDIO] Commit ignored - not enough audio (${audioChunksSinceLastCommit} chunks)`,
                );
                return;
            }

            if (responseInProgress) {
                console.log(
                    `[AUDIO] Commit received but response already in progress`,
                );
                return;
            }

            console.log(
                `[AUDIO] Commit received - triggering response (${audioChunksSinceLastCommit} chunks)`,
            );
            if (openaiWs.readyState === WebSocket.OPEN) {
                openaiWs.send(
                    JSON.stringify({
                        type: "input_audio_buffer.commit",
                    }),
                );
                openaiWs.send(
                    JSON.stringify({
                        type: "response.create",
                    }),
                );
                responseInProgress = true;
                audioChunksSinceLastCommit = 0;
            }
            return;
        }

        if (messageStr.length < 100) {
            console.log(
                `[AUDIO] Skipping short message: "${messageStr.substring(0, 50)}"`,
            );
            return;
        }

        const audioBase64 = messageStr;
        audioChunksReceived++;
        audioChunksSinceLastCommit++;

        const audioBytes = Buffer.from(audioBase64, "base64").length;

        if (audioChunksReceived === 1) {
            console.log(`[AUDIO IN] First chunk received! (${audioBytes} bytes)`);
        }
        if (audioChunksReceived % 100 === 0) {
            console.log(
                `[AUDIO IN] Chunk #${audioChunksReceived} (${audioBytes} bytes)`,
            );
        }

        if (openaiWs.readyState === WebSocket.OPEN) {
            openaiWs.send(
                JSON.stringify({
                    type: "input_audio_buffer.append",
                    audio: audioBase64,
                }),
            );
        } else {
            if (audioChunksReceived === 1) {
                console.log(
                    `[WARNING] OpenAI WebSocket not open yet, dropping audio`,
                );
            }
        }
    });

    clientWs.on("close", () => {
        console.log("Client disconnected from audio endpoint");
        if (openaiWs.readyState === WebSocket.OPEN) {
            openaiWs.close();
        }
    });

    clientWs.on("error", (error) => {
        console.log(`Audio client WebSocket error: ${error}`);
    });
}

function main() {
    const nidalheimAPIKey = process.env.NIDALHEIM_API_KEY;
    if (!nidalheimAPIKey) {
        console.error("Error: NIDALHEIM_API_KEY environment variable is not defined");
        process.exit(1);
    }

    const server = http.createServer();
    const wss = new WebSocketServer({ noServer: true });

    server.on("upgrade", (request, socket, head) => {
        const url = new URL(request.url, `http://${request.headers.host}`);
        const apiKey = url.searchParams.get("api_key");

        if (apiKey !== nidalheimAPIKey) {
            console.log("Connection refused: invalid api_key");
            socket.destroy();
            return;
        }

        if (url.pathname === "/text") {
            wss.handleUpgrade(request, socket, head, (ws) => {
                handleTextConnection(ws);
            });
        } else if (url.pathname === "/audio") {
            wss.handleUpgrade(request, socket, head, (ws) => {
                handleAudioConnection(ws);
            });
        } else {
            console.log(`Connection refused for URL: ${url.pathname}`);
            socket.destroy();
        }
    });

    const port = process.env.PORT || 3002;
    server.listen(port, "0.0.0.0", () => {
        console.log(`Internal binding: ws://localhost:${port}`);
        console.log(`Available endpoints:`);
        console.log(`/text`);
        console.log(`/audio`);
    });

    process.on("SIGINT", () => {
        console.log("Stopping WebSocket server.");
        server.close(() => {
            console.log("Server stopped.");
            process.exit(0);
        });
    });
}

main();
