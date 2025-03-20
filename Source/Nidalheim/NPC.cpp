// Fill out your copyright notice in the Description page of Project Settings.


#include "NPC.h"

DEFINE_LOG_CATEGORY_STATIC(UNPCSub, Log, All);

UNPC::UNPC()
{
    if (!FModuleManager::Get().IsModuleLoaded("WebSockets")) {
        FModuleManager::Get().LoadModule("WebSockets");
    }

    WebSocket = FWebSocketsModule::Get().CreateWebSocket(
        TEXT("ws://localhost:8765"),
        FString());

    WebSocket->OnConnected().AddUObject(this, &UNPC::OnConnected);
    WebSocket->OnConnectionError().AddUObject(this, &UNPC::OnConnectionError);
    WebSocket->OnMessage().AddUObject(this, &UNPC::OnMessageReceived);

    WebSocket->Connect();
}

void UNPC::SendMessageToNPC(FString Message)
{
    if (!WebSocket || !WebSocket->IsConnected()) {
        UE_LOG(UNPCSub, Error, TEXT("WebSocket non connecté, impossible d'envoyer le message !"));
        return;
    }

    WebSocket->Send(Message);
    UE_LOG(UNPCSub, Warning, TEXT("The user sent to the NPC the message: %s"), *Message);
}

void UNPC::OnConnected()
{
    UE_LOG(LogTemp, Warning, TEXT("WebSocket connecté !"));
}

void UNPC::OnConnectionError(const FString& Error)
{
    UE_LOG(LogTemp, Error, TEXT("Erreur de connexion WebSocket : %s"), *Error);
}

void UNPC::OnMessageReceived(const FString& Message)
{
    UE_LOG(LogTemp, Warning, TEXT("Message reçu : %s"), *Message);
    // OnMessageReceivedFromNPC(Message);
}
