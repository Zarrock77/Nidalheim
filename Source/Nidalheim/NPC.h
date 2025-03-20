// Fill out your copyright notice in the Description page of Project Settings.

#pragma once

#include "CoreMinimal.h"
#include "UObject/NoExportTypes.h"
#include "IWebSocket.h"
#include "WebSocketsModule.h"
#include "NPC.generated.h"

/**
 * 
 */
UCLASS(Blueprintable)
class NIDALHEIM_API UNPC : public UObject
{
	GENERATED_BODY()

public:
	UNPC();

	UFUNCTION(BlueprintCallable)
	void SendMessageToNPC(FString message);

    // UFUNCTION(BlueprintImplementableEvent)
	// void OnMessageReceivedFromNPC(FString message);

private:
	TSharedPtr<IWebSocket> WebSocket;

    void OnConnected();
    void OnConnectionError(const FString& Error);
    void OnMessageReceived(const FString& Message);
};
