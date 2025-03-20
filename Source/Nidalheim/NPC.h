// Fill out your copyright notice in the Description page of Project Settings.

#pragma once

#include "CoreMinimal.h"
#include "UObject/NoExportTypes.h"
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
};
