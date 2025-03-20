#pragma once

#include "CoreMinimal.h"
#include "UObject/NoExportTypes.h"
#include "IWebSocket.h"
#include "WebSocketsModule.h"
#include "NPC.generated.h"

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnMessageReceivedSignature, const FString&, Message);

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

    UPROPERTY(BlueprintAssignable)
    FOnMessageReceivedSignature OnMessageReceivedDelegate;

private:
    TSharedPtr<IWebSocket> WebSocket;

    void OnConnected();
    void OnConnectionError(const FString& Error);
    void HandleMessageReceived(const FString& Message);
};
