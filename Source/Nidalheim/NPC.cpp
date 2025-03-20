// Fill out your copyright notice in the Description page of Project Settings.


#include "NPC.h"

DEFINE_LOG_CATEGORY_STATIC(UNPCSub, Log, All);

UNPC::UNPC()
{
    UE_LOG(UNPCSub, Warning, TEXT("CREATED ONE TIME HERE!!!"));
}

void UNPC::SendMessageToNPC(FString message)
{
    UE_LOG(UNPCSub, Warning, TEXT("The user sent to the NPC the message: %s"), *message);
}
