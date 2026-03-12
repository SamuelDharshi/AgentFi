import {
  AutonomousTraderSkill,
  loadAutonomousTraderConfigFromEnv,
} from "./skills/autonomousTraderSkill";

let autonomousSkill: AutonomousTraderSkill | null = null;

export async function startOpenClawAutonomy(topicId: string): Promise<void> {
  const config = loadAutonomousTraderConfigFromEnv();
  if (!config.enabled) {
    return;
  }

  if (autonomousSkill) {
    return;
  }

  autonomousSkill = new AutonomousTraderSkill(
    {
      topicId,
      log: (message) => console.log(message),
    },
    config
  );

  await autonomousSkill.start();
}

export async function stopOpenClawAutonomy(): Promise<void> {
  if (!autonomousSkill) {
    return;
  }

  await autonomousSkill.stop();
  autonomousSkill = null;
}
