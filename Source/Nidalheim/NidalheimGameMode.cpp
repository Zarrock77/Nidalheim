// Copyright Epic Games, Inc. All Rights Reserved.

#include "NidalheimGameMode.h"
#include "NidalheimCharacter.h"
#include "UObject/ConstructorHelpers.h"

ANidalheimGameMode::ANidalheimGameMode()
	: Super()
{
	// set default pawn class to our Blueprinted character
	static ConstructorHelpers::FClassFinder<APawn> PlayerPawnClassFinder(TEXT("/Game/FirstPerson/Blueprints/BP_FirstPersonCharacter"));
	DefaultPawnClass = PlayerPawnClassFinder.Class;

}
